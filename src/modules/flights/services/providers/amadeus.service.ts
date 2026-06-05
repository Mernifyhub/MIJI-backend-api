import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class AmadeusService {
  private readonly logger = new Logger(AmadeusService.name);
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // ── Get access token ──
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

    if (!clientId || !clientSecret) {
      throw new Error('AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET not configured');
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
      throw new Error(`Amadeus auth failed: ${data.error_description}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.accessToken!;
  }

  // ── Search flights ──
  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com';

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
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const raw = await res.json();

      if (!res.ok) {
        this.logger.error('Amadeus API error:', raw);
        return { offers: [], ok: false, status: res.status };
      }

      const offers = raw?.data || [];
      this.logger.log(`Amadeus returned ${offers.length} offers`);

      return { offers, ok: true, status: res.status };
    } catch (error) {
      this.logger.error('Amadeus search error:', error);
      return { offers: [], ok: false, status: 500 };
    }
  }

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