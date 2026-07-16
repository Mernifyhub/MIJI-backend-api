// src/modules/flights/services/providers/amadeus.service.ts

import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class AmadeusService {
  private readonly logger = new Logger(AmadeusService.name);

  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // ═══════════════════════════════════════════════════════════
  // 🔑 AUTH (OAuth2 Token)
  // ═══════════════════════════════════════════════════════════
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

    if (!clientId || !clientSecret) {
      throw new Error('Amadeus credentials not configured');
    }

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

    if (!res.ok) {
      this.logger.error('Amadeus authentication failed');
      throw new Error('Authentication failed');
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.accessToken!;
  }

  // ═══════════════════════════════════════════════════════════
  // 🔍 SEARCH FLIGHTS
  // ═══════════════════════════════════════════════════════════
  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl =
        process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      const searchParams = new URLSearchParams({
        originLocationCode: params.origin,
        destinationLocationCode: params.destination,
        departureDate: params.departureDate,
        adults: String(params.adults),
        travelClass: this.mapCabinClass(params.cabinClass),
        currencyCode: 'USD',
        max: '50',
      });

      if (params.children > 0) {
        searchParams.set('children', String(params.children));
      }

      if (params.infants > 0) {
        searchParams.set('infants', String(params.infants));
      }

      if (params.tripType === 'ROUND_TRIP' && params.returnDate) {
        searchParams.set('returnDate', params.returnDate);
      }

      this.logger.log(
        `Amadeus search: ${params.origin} → ${params.destination} | ${params.departureDate}`,
      );

      const res = await fetch(
        `${baseUrl}/v2/shopping/flight-offers?${searchParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const raw = await res.json();

      if (!res.ok) {
        // ✅ Only log status code, not full payload
        this.logger.error(`Amadeus search failed (${res.status})`);
        return { offers: [], ok: false, status: res.status };
      }

      const offers = raw?.data || [];
      this.logger.log(`Amadeus returned ${offers.length} offers`);

      return { offers, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Amadeus search exception');
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 💰 CONFIRM PRICE
  // ═══════════════════════════════════════════════════════════
  async confirmPrice(flightOffer: any): Promise<{
    data: any;
    ok: boolean;
    status: number;
    error?: { message: string };
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl =
        process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      // Validate offer structure
      if (!flightOffer?.type || flightOffer.type !== 'flight-offer') {
        return {
          data: null,
          ok: false,
          status: 400,
          error: { message: 'Invalid flight offer' },
        };
      }

      this.logger.log('Confirming Amadeus price...');

      const requestBody = {
        data: {
          type: 'flight-offers-pricing',
          flightOffers: [flightOffer],
        },
      };

      const res = await fetch(`${baseUrl}/v1/shopping/flight-offers/pricing`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await res.json();

      if (!res.ok) {
        // ✅ Server-only log (status + code only)
        const errorCode = data?.errors?.[0]?.code || 'unknown';
        this.logger.error(
          `Amadeus price confirmation failed (${res.status}) | Code: ${errorCode}`,
        );

        const errorDetail =
          data?.errors?.[0]?.detail ||
          data?.errors?.[0]?.title ||
          data?.error_description ||
          'Price confirmation failed';

        // ✅ Client-safe error mapping
        const userMessage = this.getUserFriendlyError(errorDetail, errorCode);

        return {
          data: null,
          ok: false,
          status: res.status,
          error: { message: userMessage },
        };
      }

      this.logger.log('Amadeus price confirmed');

      return { data: data.data, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Amadeus confirmPrice exception');
      return {
        data: null,
        ok: false,
        status: 500,
        error: { message: 'Service temporarily unavailable' },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🎟️ CREATE ORDER (Booking)
  // ═══════════════════════════════════════════════════════════
  async createOrder(
    flightOffer: any,
    travelers: any[],
    contacts?: any[],
  ): Promise<{
    order: any;
    ok: boolean;
    status: number;
    error?: { message: string };
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl =
        process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      this.logger.log(
        `Creating Amadeus order | Travelers: ${travelers.length}`,
      );

      const body = {
        data: {
          type: 'flight-order',
          flightOffers: [flightOffer],
          travelers: travelers,
          ...(contacts && { contacts }),
        },
      };

      const res = await fetch(`${baseUrl}/v1/booking/flight-orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // ✅ Server-only log (status + code only)
        const errorCode = data?.errors?.[0]?.code || 'unknown';
        this.logger.error(
          `Amadeus order creation failed (${res.status}) | Code: ${errorCode}`,
        );

        const errorDetail =
          data?.errors?.[0]?.detail ||
          data?.errors?.[0]?.title ||
          'Booking failed';

        // ✅ Client-safe error mapping
        const userMessage = this.getUserFriendlyError(errorDetail, errorCode);

        return {
          order: null,
          ok: false,
          status: res.status,
          error: { message: userMessage },
        };
      }

      const pnr = data.data?.associatedRecords?.[0]?.reference;
      this.logger.log(`Amadeus order created | PNR: ${pnr}`);

      return { order: data.data, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Amadeus createOrder exception');
      return {
        order: null,
        ok: false,
        status: 500,
        error: { message: 'Booking service temporarily unavailable' },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 📄 GET ORDER
  // ═══════════════════════════════════════════════════════════
  async getOrder(orderId: string): Promise<{
    order: any;
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl =
        process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      const res = await fetch(
        `${baseUrl}/v1/booking/flight-orders/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`Amadeus get order failed (${res.status})`);
        return { order: null, ok: false, status: res.status };
      }

      return { order: data.data, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Amadeus getOrder exception');
      return { order: null, ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ❌ CANCEL ORDER
  // ═══════════════════════════════════════════════════════════
  async cancelOrder(orderId: string): Promise<{
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl =
        process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

      const res = await fetch(
        `${baseUrl}/v1/booking/flight-orders/${orderId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        this.logger.error(`Amadeus cancel order failed (${res.status})`);
        return { ok: false, status: res.status };
      }

      this.logger.log(`Amadeus order cancelled: ${orderId}`);
      return { ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Amadeus cancelOrder exception');
      return { ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS (Server-only, never exposed to client)
  // ═══════════════════════════════════════════════════════════

  /**
   * User-friendly error message mapping
   * Hides internal error details from end users
   */
  private getUserFriendlyError(
    originalMessage: string,
    errorCode?: string | number,
  ): string {
    const code = String(errorCode || '').toLowerCase();
    const msg = (originalMessage || '').toLowerCase();

    // Authentication / token errors
    if (msg.includes('token') || msg.includes('unauthorized')) {
      return 'Authentication error. Please try again';
    }

    // Offer expired / no longer available
    if (
      msg.includes('no longer available') ||
      msg.includes('expired') ||
      msg.includes('not bookable') ||
      code === '38047' ||
      code === '38192'
    ) {
      return 'This flight is no longer available. Please search again';
    }

    // Price changed
    if (msg.includes('price') && msg.includes('change')) {
      return 'The price has changed. Please refresh and try again';
    }

    // Segment / sell issues
    if (
      msg.includes('sell segment') ||
      msg.includes('segment') ||
      msg.includes('class') ||
      code === '34651'
    ) {
      return 'This flight is no longer available. Please search again';
    }

    // Invalid passenger data
    if (msg.includes('traveler') || msg.includes('passenger')) {
      return 'Invalid passenger information. Please check details';
    }

    // Invalid phone
    if (msg.includes('phone')) {
      return 'Please provide a valid phone number';
    }

    // Invalid email
    if (msg.includes('email')) {
      return 'Please provide a valid email address';
    }

    // Invalid country / nationality
    if (
      msg.includes('issuance country') ||
      msg.includes('country') ||
      msg.includes('nationality')
    ) {
      return 'Please provide valid nationality/country information';
    }

    // Address required
    if (msg.includes('address')) {
      return 'Please provide a valid address';
    }

    // Document / passport issues
    if (
      msg.includes('document') ||
      msg.includes('passport') ||
      msg.includes('issuance')
    ) {
      return 'Please provide valid passport information';
    }

    // Date of birth issues
    if (msg.includes('date of birth') || msg.includes('born')) {
      return 'Passenger date of birth is invalid';
    }

    // Currency issues
    if (msg.includes('currency')) {
      return 'Currency error. Please try again';
    }

    // Rate limit
    if (msg.includes('rate limit') || code === '429') {
      return 'Too many requests. Please try again in a moment';
    }

    // Server / internal errors
    if (
      msg.includes('internal') ||
      msg.includes('server error') ||
      code === '500'
    ) {
      return 'Service temporarily unavailable. Please try again';
    }

    // Generic fallback
    return 'Booking failed. Please try again or contact support';
  }

  /**
   * Convert app-level cabin class → Amadeus format
   */
  private mapCabinClass(cabinClass: string): string {
    const map: Record<string, string> = {
      economy: 'ECONOMY',
      premium_economy: 'PREMIUM_ECONOMY',
      business: 'BUSINESS',
      first: 'FIRST',
    };
    return map[cabinClass.toLowerCase()] || 'ECONOMY';
  }
}