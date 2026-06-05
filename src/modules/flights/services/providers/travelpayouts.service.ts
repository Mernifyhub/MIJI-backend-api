// src/modules/flights/services/providers/travelpayouts.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class TravelpayoutsService {
  private readonly logger = new Logger(TravelpayoutsService.name);

  private readonly API_URL =
    'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';

  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    const token = process.env.TRAVELPAYOUTS_TOKEN;
    const currency = (
      process.env.TRAVELPAYOUTS_CURRENCY || 'usd'
    ).toLowerCase();
    const limit = Math.min(
      Number(process.env.TRAVELPAYOUTS_LIMIT || 30),
      1000,
    );

    if (!token) {
      this.logger.error('TRAVELPAYOUTS_TOKEN is not set');
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

    // ✅ FIX #1: EXACT date use করো (YYYY-MM-DD), month না
    const departureDate = route.departureAt; // already YYYY-MM-DD
    const returnDate = route.returnAt;       // already YYYY-MM-DD or undefined

    const query = new URLSearchParams({
      origin: route.origin,
      destination: route.destination,
      departure_at: departureDate,           // ✅ exact date
      cy: currency,
      sorting: 'price',
      direct: 'false',
      unique: 'false',
      limit: String(limit),
      page: '1',
      token,
    });

    // ✅ FIX #2: Always explicitly set one_way
    if (route.oneWay) {
      query.set('one_way', 'true');
    } else {
      query.set('one_way', 'false');         // ✅ round-trip এর জন্য explicit
      if (returnDate) {
        query.set('return_at', returnDate);  // ✅ exact return date
      }
    }

    const fullUrl = `${this.API_URL}?${query.toString()}`;

    this.logger.log(
      `Travelpayouts search: ${route.origin} → ${route.destination} | departure=${departureDate}${returnDate ? ` | return=${returnDate}` : ''} | oneWay=${route.oneWay}`,
    );
    this.logger.log(`Travelpayouts URL: ${fullUrl}`);

    try {
      const res = await fetch(fullUrl, {
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

      this.logger.log(
        `Travelpayouts raw keys: ${Object.keys(raw || {}).join(', ')}`,
      );

      const responseCurrency = String(
        raw?.currency || currency || 'USD',
      ).toUpperCase();

      // ✅ FIX #3: Filter offers strictly by requested date & trip type
      let offers = Array.isArray(raw?.data)
        ? raw.data.map((offer: any) => ({
            ...offer,
            currency: String(
              offer?.currency || responseCurrency,
            ).toUpperCase(),
          }))
        : [];

      // ✅ Strict date filter — API sometimes returns nearby dates
      offers = offers.filter((offer: any) => {
        const offerDepartDate = String(offer?.departure_at || '').slice(0, 10);
        if (offerDepartDate !== departureDate) return false;

        // For round-trip, also verify return date matches
        if (!route.oneWay && returnDate) {
          const offerReturnDate = String(offer?.return_at || '').slice(0, 10);
          if (offerReturnDate !== returnDate) return false;
        }

        // For one-way, ensure no return_at exists
        if (route.oneWay && offer?.return_at) return false;

        return true;
      });

      this.logger.log(
        `Travelpayouts returned ${offers.length} offers (after strict filter) | success=${raw?.success} | responseCurrency=${responseCurrency}`,
      );

      if (offers.length > 0) {
        this.logger.log(
          `Travelpayouts SAMPLE => ${JSON.stringify(offers[0])}`,
        );
      } else {
        this.logger.warn(
          `Travelpayouts EMPTY after strict filter | route=${route.origin}-${route.destination} | date=${departureDate}`,
        );

        // ✅ Fallback: try month-level search if exact date returns nothing
        return await this.searchByMonth(route, currency, limit, token);
      }

      return { offers, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error(
        `Travelpayouts fetch exception: ${error?.message || error}`,
        error?.stack,
      );
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ==================== FALLBACK: MONTH-LEVEL SEARCH ====================
  // যদি exact date এ কিছু না পাও, তখন month level এ try করো
  // কিন্তু still trip type respect করতে হবে

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
    const departureMonth = route.departureAt.slice(0, 7);
    const returnMonth = route.returnAt?.slice(0, 7);

    this.logger.log(
      `Travelpayouts fallback (month-level): ${route.origin} → ${route.destination} | month=${departureMonth} | oneWay=${route.oneWay}`,
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

    const url = `${this.API_URL}?${query.toString()}`;
    this.logger.log(`Travelpayouts fallback URL: ${url}`);

    try {
      const res = await fetch(url, {
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

      // ✅ Even in fallback, filter by trip type
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
      this.logger.error(
        `Travelpayouts fallback exception: ${err?.message}`,
      );
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ==================== ROUTE EXTRACTOR ====================

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

    this.logger.log(
      `Route extracted: ${origin} → ${destination} | dept=${departureAt} | ret=${returnAt || 'N/A'} | oneWay=${oneWay}`,
    );

    return {
      origin,
      destination,
      departureAt,
      returnAt: returnAt || undefined,
      oneWay,
    };
  }

  // ==================== DATE NORMALIZER ====================

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