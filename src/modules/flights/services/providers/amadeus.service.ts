import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class AmadeusService {
  private readonly logger = new Logger(AmadeusService.name);

  // ─────────────────────────────────────────────
  // Token caching: avoid requesting a new token
  // on every API call (tokens are valid ~30 mins)
  // ─────────────────────────────────────────────
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // ═══════════════════════════════════════════════════════════
  // 🔑 AUTH: Get OAuth2 access token from Amadeus
  // Endpoint: POST /v1/security/oauth2/token
  // ═══════════════════════════════════════════════════════════
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (saves API calls)
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Load credentials from environment variables
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

    // Fail fast if credentials are missing
    if (!clientId || !clientSecret) {
      throw new Error('AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET not configured');
    }

    // Request a new access token using client_credentials grant
    const res = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const data = await res.json();

    // Throw if authentication fails
    if (!res.ok) {
      throw new Error(`Amadeus auth failed: ${data.error_description}`);
    }

    // Cache token & set expiry (subtract 60s as a safety buffer)
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.accessToken!;
  }

  // ═══════════════════════════════════════════════════════════
  // 🔍 STEP 1: SEARCH FLIGHTS
  // Endpoint: GET /v2/shopping/flight-offers
  // Returns a list of available flight offers
  // ═══════════════════════════════════════════════════════════
  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      // Build query string with required search parameters
      const searchParams = new URLSearchParams({
        originLocationCode: params.origin,                  // e.g. "DAC"
        destinationLocationCode: params.destination,        // e.g. "DXB"
        departureDate: params.departureDate,                // "YYYY-MM-DD"
        adults: String(params.adults),                      // at least 1
        travelClass: this.mapCabinClass(params.cabinClass), // ECONOMY/BUSINESS/etc.
        currencyCode: 'USD',
        max: '50',                                          // limit results
      });

      // Optional: add children passengers
      if (params.children > 0) {
        searchParams.set('children', String(params.children));
      }

      // Optional: add infant passengers
      if (params.infants > 0) {
        searchParams.set('infants', String(params.infants));
      }

      // Optional: add return date for round-trip flights
      if (params.tripType === 'ROUND_TRIP' && params.returnDate) {
        searchParams.set('returnDate', params.returnDate);
      }

      this.logger.log(
        `Amadeus search: ${params.origin} → ${params.destination} | ${params.departureDate}`,
      );

      // Make the search API call
      const res = await fetch(
        `${baseUrl}/v2/shopping/flight-offers?${searchParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const raw = await res.json();

      // Handle API errors gracefully
      if (!res.ok) {
        this.logger.error('Amadeus API error:', raw);
        return { offers: [], ok: false, status: res.status };
      }

      // Extract offers from response
      const offers = raw?.data || [];
      this.logger.log(`Amadeus returned ${offers.length} offers`);

      return { offers, ok: true, status: res.status };
    } catch (error) {
      // Catch network/unexpected errors
      this.logger.error('Amadeus search error:', error);
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 💰 STEP 2: CONFIRM PRICE (Mandatory before booking)
  // Endpoint: POST /v1/shopping/flight-offers/pricing
  // Why? Prices can change — Amadeus re-validates the offer
  // and returns the final price + tax breakdown.
  // ═══════════════════════════════════════════════════════════
  async confirmPrice(flightOffer: any): Promise<{
    data: any;
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      this.logger.log('Confirming flight price...');

      // Send the flight offer back to Amadeus for re-pricing
      const res = await fetch(`${baseUrl}/v1/shopping/flight-offers/pricing`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            type: 'flight-offers-pricing',
            flightOffers: [flightOffer], // pass the offer from search step
          },
        }),
      });

      const data = await res.json();

      // If price confirmation fails (e.g. offer expired)
      if (!res.ok) {
        this.logger.error('Price confirmation failed:', data);
        return { data: null, ok: false, status: res.status };
      }

      this.logger.log('✅ Price confirmed successfully');

      // Returned data contains updated flightOffers (with final price)
      return { data: data.data, ok: true, status: res.status };
    } catch (error) {
      this.logger.error('confirmPrice error:', error);
      return { data: null, ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🎟️ STEP 3: CREATE FLIGHT ORDER (Actual Booking!)
  // Endpoint: POST /v1/booking/flight-orders
  // This creates the PNR (Passenger Name Record) — the real ticket
  // ═══════════════════════════════════════════════════════════
  async createOrder(
    flightOffer: any,        // Confirmed flight offer from Step 2
    travelers: any[],        // Passenger details (name, dob, passport, etc.)
    contacts?: any[],        // Optional: email/phone for booking
  ): Promise<{
    order: any;
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      // Build request body in Amadeus format
      const body = {
        data: {
          type: 'flight-order',
          flightOffers: [flightOffer],  // must be the priced offer
          travelers: travelers,          // array of passenger objects
          ...(contacts && { contacts }), // include contacts only if provided
        },
      };

      this.logger.log('Creating flight order (booking)...');

      // Send booking request to Amadeus
      const res = await fetch(`${baseUrl}/v1/booking/flight-orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      // Handle booking failures (invalid traveler info, expired offer, etc.)
      if (!res.ok) {
        this.logger.error('Order creation failed:', data);
        return { order: null, ok: false, status: res.status };
      }

      // Extract PNR reference (the airline booking reference)
      const pnr = data.data?.associatedRecords?.[0]?.reference;
      this.logger.log(`✅ Order created successfully! PNR: ${pnr}`);

      // Returned data includes: order ID, PNR, ticket info, etc.
      return { order: data.data, ok: true, status: res.status };
    } catch (error) {
      this.logger.error('createOrder error:', error);
      return { order: null, ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 📄 GET ORDER DETAILS (Optional — useful for ticket status)
  // Endpoint: GET /v1/booking/flight-orders/{orderId}
  // ═══════════════════════════════════════════════════════════
  async getOrder(orderId: string): Promise<{
    order: any;
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      const res = await fetch(`${baseUrl}/v1/booking/flight-orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error('Get order failed:', data);
        return { order: null, ok: false, status: res.status };
      }

      return { order: data.data, ok: true, status: res.status };
    } catch (error) {
      this.logger.error('getOrder error:', error);
      return { order: null, ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ❌ CANCEL ORDER (Optional — for booking cancellation)
  // Endpoint: DELETE /v1/booking/flight-orders/{orderId}
  // ═══════════════════════════════════════════════════════════
  async cancelOrder(orderId: string): Promise<{
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      const res = await fetch(`${baseUrl}/v1/booking/flight-orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        this.logger.error(`Cancel order failed: ${res.status}`);
        return { ok: false, status: res.status };
      }

      this.logger.log(`✅ Order ${orderId} cancelled`);
      return { ok: true, status: res.status };
    } catch (error) {
      this.logger.error('cancelOrder error:', error);
      return { ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🛠️ HELPER: Convert app-level cabin class → Amadeus format
  // ═══════════════════════════════════════════════════════════
  private mapCabinClass(cabinClass: string): string {
    const map: Record<string, string> = {
      economy: 'ECONOMY',
      premium_economy: 'PREMIUM_ECONOMY',
      business: 'BUSINESS',
      first: 'FIRST',
    };
    // Fallback to ECONOMY if unknown value passed
    return map[cabinClass.toLowerCase()] || 'ECONOMY';
  }
}