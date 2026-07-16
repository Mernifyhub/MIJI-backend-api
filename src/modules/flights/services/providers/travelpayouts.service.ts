// src/modules/flights/services/providers/travelpayouts.service.ts

import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class TravelpayoutsService {
  private readonly logger = new Logger(TravelpayoutsService.name);

  private readonly API_URL =
    'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

  // ═══════════════════════════════════════════════════════════
  // 🔍 SEARCH FLIGHTS
  // ═══════════════════════════════════════════════════════════
  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    try {
      const token = process.env.TRAVELPAYOUTS_TOKEN;
      const currency = (
        process.env.TRAVELPAYOUTS_CURRENCY || 'usd'
      ).toLowerCase();
      const limit = Math.min(
        Number(process.env.TRAVELPAYOUTS_LIMIT || 30),
        1000,
      );

      if (!token) {
        this.logger.error('TRAVELPAYOUTS_TOKEN is not configured');
        return { offers: [], ok: false, status: 401 };
      }

      const route = this.extractRoute(params);

      if (!route.origin || !route.destination || !route.departureAt) {
        this.logger.error(
          `Missing required params | origin=${route.origin} destination=${route.destination} departureAt=${route.departureAt}`,
        );
        return { offers: [], ok: false, status: 400 };
      }

      if ((params as any)?.slices?.length > 2) {
        this.logger.warn(
          'Travelpayouts does not support multi-city. Using first slice only.',
        );
      }

      const departureDate = route.departureAt;
      const returnDate = route.returnAt;

      const query = new URLSearchParams({
        origin: route.origin,
        destination: route.destination,
        departure_at: departureDate,
        cy: currency,
        sorting: 'price',
        direct: 'false',
        unique: 'false',
        limit: String(limit),
        page: '1',
        token,
      });

      if (route.oneWay) {
        query.set('one_way', 'true');
      } else {
        query.set('one_way', 'false');
        if (returnDate) {
          query.set('return_at', returnDate);
        }
      }

      this.logger.log(
        `Travelpayouts search: ${route.origin} → ${route.destination} | departure=${departureDate}${returnDate ? ` | return=${returnDate}` : ''} | oneWay=${route.oneWay}`,
      );

      const res = await fetch(`${this.API_URL}?${query.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        let errorBody: any = {};
        try {
          errorBody = await res.json();
        } catch {
          errorBody = { raw: await res.text() };
        }

        this.logger.error(
          `Travelpayouts API error | status=${res.status} | body=${JSON.stringify(errorBody)}`,
        );

        return { offers: [], ok: false, status: res.status };
      }

      const raw = await res.json();
      const responseCurrency = String(
        raw?.currency || currency || 'USD',
      ).toUpperCase();

      let offers = Array.isArray(raw?.data)
        ? raw.data.map((offer: any) => ({
            ...offer,
            currency: String(
              offer?.currency || responseCurrency,
            ).toUpperCase(),
          }))
        : [];

      // Strict date filter
      offers = offers.filter((offer: any) => {
        const offerDepartDate = String(offer?.departure_at || '').slice(0, 10);
        if (offerDepartDate !== departureDate) return false;

        if (!route.oneWay && returnDate) {
          const offerReturnDate = String(offer?.return_at || '').slice(0, 10);
          if (offerReturnDate !== returnDate) return false;
        }

        if (route.oneWay && offer?.return_at) return false;

        return true;
      });

      this.logger.log(
        `Travelpayouts returned ${offers.length} offers (after strict filter)`,
      );

      // Fallback to month-level if no exact match
      if (offers.length === 0) {
        this.logger.warn(
          `Travelpayouts EMPTY after strict filter | trying month-level fallback`,
        );
        return await this.searchByMonth(route, currency, limit, token);
      }

      return { offers, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Travelpayouts search exception:', error?.message);
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 💰 CONFIRM PRICE
  // ⚠️ Travelpayouts is a META-SEARCH (affiliate)
  // It doesn't have a real pricing/booking API
  // Returns the offer as-is for compatibility
  // ═══════════════════════════════════════════════════════════
  async confirmPrice(flightOffer: any): Promise<{
    data: any;
    ok: boolean;
    status: number;
    error?: { message: string; full?: any };
  }> {
    this.logger.log('═══════════════════════════════════════');
    this.logger.log('🔍 TRAVELPAYOUTS PRICE CONFIRMATION');
    this.logger.log('═══════════════════════════════════════');
    this.logger.warn(
      'Travelpayouts is a meta-search affiliate. No real-time pricing available.',
    );

    if (!flightOffer) {
      return {
        data: null,
        ok: false,
        status: 400,
        error: { message: 'Invalid Travelpayouts offer' },
      };
    }

    // Return the offer as-is (simulated confirmation)
    return {
      data: {
        flightOffers: [flightOffer],
      },
      ok: true,
      status: 200,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 🎟️ CREATE ORDER
  // ⚠️ Travelpayouts doesn't support direct booking
  // Returns affiliate link for redirect
  // ═══════════════════════════════════════════════════════════
  async createOrder(
    flightOffer: any,
    travelers: any[],
    contacts?: any[],
  ): Promise<{
    order: any;
    ok: boolean;
    status: number;
    error?: { message: string; full?: any };
  }> {
    this.logger.log('═══════════════════════════════════════');
    this.logger.log('🎫 TRAVELPAYOUTS ORDER CREATION');
    this.logger.log('═══════════════════════════════════════');
    this.logger.warn(
      'Travelpayouts does NOT support direct booking. Redirect required.',
    );

    return {
      order: null,
      ok: false,
      status: 501,
      error: {
        message:
          'Travelpayouts is a meta-search affiliate. Direct booking not supported. Use affiliate link to redirect user.',
        full: {
          provider: 'travelpayouts',
          affiliateLink: flightOffer?.link || null,
          note: 'Redirect user to affiliate partner for booking',
        },
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // 📄 GET ORDER (Not supported)
  // ═══════════════════════════════════════════════════════════
  async getOrder(orderId: string): Promise<{
    order: any;
    ok: boolean;
    status: number;
  }> {
    this.logger.warn('Travelpayouts does not support order retrieval');
    return { order: null, ok: false, status: 501 };
  }

  // ═══════════════════════════════════════════════════════════
  // ❌ CANCEL ORDER (Not supported)
  // ═══════════════════════════════════════════════════════════
  async cancelOrder(orderId: string): Promise<{
    ok: boolean;
    status: number;
  }> {
    this.logger.warn('Travelpayouts does not support order cancellation');
    return { ok: false, status: 501 };
  }

  // ═══════════════════════════════════════════════════════════
  // FALLBACK: MONTH-LEVEL SEARCH
  // ═══════════════════════════════════════════════════════════
  private async searchByMonth(
    route: {
      origin: string;
      destination: string;
      departureAt: string;
      returnAt?: string;
      oneWay: boolean;
    },
    currency: string,
    limit: number,
    token: string,
  ): Promise<{ offers: any[]; ok: boolean; status: number }> {
    try {
      const departureMonth = route.departureAt.slice(0, 7);
      const returnMonth = route.returnAt?.slice(0, 7);

      this.logger.log(
        `Travelpayouts fallback (month-level): ${route.origin} → ${route.destination} | month=${departureMonth}`,
      );

      const query = new URLSearchParams({
        origin: route.origin,
        destination: route.destination,
        departure_at: departureMonth,
        cy: currency,
        sorting: 'price',
        direct: 'false',
        unique: 'false',
        limit: String(limit),
        page: '1',
        token,
      });

      if (route.oneWay) {
        query.set('one_way', 'true');
      } else {
        query.set('one_way', 'false');
        if (returnMonth) {
          query.set('return_at', returnMonth);
        }
      }

      const res = await fetch(`${this.API_URL}?${query.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        this.logger.error(
          `Travelpayouts fallback failed: status=${res.status}`,
        );
        return { offers: [], ok: false, status: res.status };
      }

      const raw = await res.json();
      const responseCurrency = String(
        raw?.currency || currency || 'USD',
      ).toUpperCase();

      let offers = Array.isArray(raw?.data)
        ? raw.data.map((offer: any) => ({
            ...offer,
            currency: String(
              offer?.currency || responseCurrency,
            ).toUpperCase(),
          }))
        : [];

      offers = offers.filter((offer: any) => {
        if (route.oneWay && offer?.return_at) return false;
        if (!route.oneWay && !offer?.return_at) return false;
        return true;
      });

      this.logger.log(
        `Travelpayouts fallback returned ${offers.length} offers`,
      );

      return { offers, ok: true, status: res.status };
    } catch (err: any) {
      this.logger.error('Travelpayouts fallback exception:', err?.message);
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private extractRoute(params: FlightSearchParams): {
    origin: string;
    destination: string;
    departureAt: string;
    returnAt?: string;
    oneWay: boolean;
  } {
    const p: any = params;
    const slices = Array.isArray(p?.slices) ? p.slices : [];

    const outbound = slices[0] || {};
    const inbound = slices[1] || null;

    const origin = String(outbound.origin || p.origin || '')
      .trim()
      .toUpperCase();

    const destination = String(outbound.destination || p.destination || '')
      .trim()
      .toUpperCase();

    const departureAt = this.normalizeDate(
      outbound.departureDate ||
        outbound.departure_date ||
        p.departureDate ||
        p.departure_date,
    );

    const returnAt = this.normalizeDate(
      inbound?.departureDate ||
        inbound?.departure_date ||
        p.returnDate ||
        p.return_date,
    );

    const oneWay = params.tripType === 'ONE_WAY' || !returnAt;

    return {
      origin,
      destination,
      departureAt,
      returnAt: returnAt || undefined,
      oneWay,
    };
  }

  private normalizeDate(value?: string | null): string {
    if (!value) return '';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }
}