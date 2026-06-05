import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class DuffelService {
  private readonly logger = new Logger(DuffelService.name);
  private readonly API_URL = 'https://api.duffel.com/air/offer_requests';

  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    const token = process.env.DUFFEL_TOKEN;
    const version = process.env.DUFFEL_VERSION || 'v2';

    if (!token) {
      throw new Error('DUFFEL_TOKEN is not configured');
    }

    const passengers = this.buildPassengers(
      params.adults,
      params.children,
      params.infants,
    );

    this.logger.log(
      `Duffel search: ${params.origin} → ${params.destination} | ${params.departureDate}`,
    );

    try {
      const res = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Duffel-Version': version,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
            
          data: {
            slices: params.slices,
            passengers,
            cabin_class: params.cabinClass,
            return_offers: true,
          },
        }),
      });

      const raw = await res.json();

      if (!res.ok) {
        this.logger.error('Duffel API error:', raw);
        return { offers: [], ok: false, status: res.status };
      }

      const offers = raw?.data?.offers || [];
      this.logger.log(`Duffel returned ${offers.length} offers`);

      return { offers, ok: true, status: res.status };
    } catch (error) {
      this.logger.error('Duffel fetch error:', error);
      return { offers: [], ok: false, status: 500 };
    }
  }

  private buildPassengers(adults: number, children: number, infants: number) {
    return [
      ...Array.from({ length: adults }, () => ({ type: 'adult' as const })),
      ...Array.from({ length: children }, () => ({ type: 'child' as const })),
      ...Array.from({ length: infants }, () => ({ type: 'infant_without_seat' as const })),
    ];
  }
}