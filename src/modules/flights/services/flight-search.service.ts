// src/modules/flights/services/flight-search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { DuffelService } from './providers/duffel.service';
import { AmadeusService } from './providers/amadeus.service';
import { TravelpayoutsService } from './providers/travelpayouts.service';
import { NormalizerService } from './processors/normalizer.service';
import { MarkupService } from './processors/markup.service';
import { DiscountService } from './processors/discount.service';
import { ApiProvidersService } from 'src/modules/api-providers/api-providers.service';
import type {
  FlightSearchParams,
  NormalizedFlight,
} from '../types/flight.types';

// ✅ source field সহ extended type
type FlightWithSource = NormalizedFlight & {
  source?: 'duffel' | 'amadeus' | 'travelpayouts';
  _provider?: 'duffel' | 'amadeus' | 'travelpayouts';
};

@Injectable()
export class FlightSearchService {
  private readonly logger = new Logger(FlightSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly duffel: DuffelService,
    private readonly amadeus: AmadeusService,
    private readonly travelpayouts: TravelpayoutsService,
    private readonly normalizer: NormalizerService,
    private readonly markupService: MarkupService,
    private readonly discountService: DiscountService,
    private readonly apiProvidersService: ApiProvidersService, // ✅ inject
  ) {}

  // ==================== DEBUG LOGGER ====================
  private logFlightPrice(
    stage: string,
    flight: any,
    extra?: Record<string, any>,
  ) {
    this.logger.log(
      JSON.stringify(
        {
          stage,
          flightId: flight?.id || null,
          provider:
            flight?.provider ||
            flight?._provider ||
            flight?.source ||
            null,
          price: flight?.price || null,
          agentUi: flight?.priceBreakdown?.agentUi || null,
          admin: flight?.priceBreakdown?.admin || null,
          discountInfo: flight?.discountInfo || null,
          ...extra,
        },
        null,
        0,
      ),
    );
  }

  // ==================== SEARCH MAIN ====================
  async search(
    params: FlightSearchParams,
  ): Promise<{
    data: FlightWithSource[];
    meta: Record<string, any>;
  }> {
    const requestedProvider = String(
      params.provider || 'all',
    ).toLowerCase();

    const allowedProviders = [
      'all',
      'duffel',
      'amadeus',
      'travelpayouts',
    ];
    const provider = allowedProviders.includes(requestedProvider)
      ? requestedProvider
      : 'all';

    // ✅ DB থেকে active providers এক query তে নিয়ে নাও
    // Cache আছে — প্রতি search এ DB hit হবে না
    const activeProviderSlugs =
      await this.apiProvidersService.getActiveProviderSlugs();

    // ✅ Helper function — provider active কিনা check
    const isProviderActive = (slug: string): boolean =>
      activeProviderSlugs.includes(slug);

    // disabled providers list — meta তে পাঠাবো
    const disabledProviders = [
      'duffel',
      'amadeus',
      'travelpayouts',
    ].filter((p) => !activeProviderSlugs.includes(p));

    this.logger.log(
      `Active providers: [${activeProviderSlugs.join(', ')}] | Disabled: [${disabledProviders.join(', ')}]`,
    );

    let rawOffers: any[] = [];
    let isFallback = false;

    this.logger.log(
      `Flight search started | requestedProvider=${params.provider || 'not-provided'} | resolvedProvider=${provider}`,
    );

    // ==================== 1. FETCH FROM PROVIDERS ====================

    // ────────── DUFFEL ──────────
    if (provider === 'duffel' || provider === 'all') {
      // ✅ admin থেকে OFF করা থাকলে skip
      if (!isProviderActive('duffel')) {
        this.logger.warn(
          `DUFFEL is disabled by admin. Skipping.`,
        );
      } else {
        try {
          const result = await this.duffel.search(params);

          this.logger.log(
            `DUFFEL => ok=${result?.ok} offers=${result?.offers?.length || 0}`,
          );

          if (result?.offers?.length > 0) {
            this.logger.log(
              `DUFFEL SAMPLE => ${JSON.stringify(result.offers[0]).slice(0, 300)}...`,
            );
          }

          if (result?.ok && Array.isArray(result.offers)) {
            rawOffers.push(
              ...result.offers.map((o) => ({
                ...o,
                _provider: 'duffel',
              })),
            );
          }
        } catch (error: any) {
          this.logger.error(
            `DUFFEL FAILED => ${error?.message || error}`,
            error?.stack,
          );
        }
      }
    }

    // ────────── AMADEUS ──────────
    if (provider === 'amadeus' || provider === 'all') {
      // ✅ admin থেকে OFF করা থাকলে skip
      if (!isProviderActive('amadeus')) {
        this.logger.warn(
          `AMADEUS is disabled by admin. Skipping.`,
        );
      } else {
        try {
          const result = await this.amadeus.search(params);

          this.logger.log(
            `AMADEUS => ok=${result?.ok} offers=${result?.offers?.length || 0}`,
          );

          if (result?.offers?.length > 0) {
            this.logger.log(
              `AMADEUS SAMPLE => ${JSON.stringify(result.offers[0]).slice(0, 300)}...`,
            );
          }

          if (result?.ok && Array.isArray(result.offers)) {
            rawOffers.push(
              ...result.offers.map((o) => ({
                ...o,
                _provider: 'amadeus',
              })),
            );
          }
        } catch (error: any) {
          this.logger.error(
            `AMADEUS FAILED => ${error?.message || error}`,
            error?.stack,
          );
        }
      }
    }

    // ────────── TRAVELPAYOUTS ──────────
    if (provider === 'travelpayouts' || provider === 'all') {
      // ✅ admin থেকে OFF করা থাকলে skip
      if (!isProviderActive('travelpayouts')) {
        this.logger.warn(
          `TRAVELPAYOUTS is disabled by admin. Skipping.`,
        );
      } else {
        try {
          const result = await this.travelpayouts.search(params);

          this.logger.log(
            `TRAVELPAYOUTS => ok=${result?.ok} offers=${result?.offers?.length || 0}`,
          );

          if (result?.offers?.length > 0) {
            this.logger.log(
              `TRAVELPAYOUTS SAMPLE => ${JSON.stringify(result.offers[0]).slice(0, 300)}...`,
            );
          }

          if (result?.ok && Array.isArray(result.offers)) {
            rawOffers.push(
              ...result.offers.map((o) => ({
                ...o,
                _provider: 'travelpayouts',
              })),
            );
          }
        } catch (error: any) {
          this.logger.error(
            `TRAVELPAYOUTS FAILED => ${error?.message || error}`,
            error?.stack,
          );
        }
      }
    }

    // ✅ provider-wise raw summary
    const rawProviderSummary = rawOffers.reduce(
      (acc: Record<string, number>, offer: any) => {
        const key = offer?._provider || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {},
    );

    this.logger.log(
      `RAW OFFERS SUMMARY => ${JSON.stringify(rawProviderSummary)}`,
    );

    // ── Debug: raw provider prices (first 5) ──
    rawOffers.slice(0, 5).forEach((offer, index) => {
      this.logger.log(
        JSON.stringify({
          stage: 'RAW_PROVIDER_PRICE',
          index: index + 1,
          provider: offer?._provider || 'unknown',
          duffel_total_amount: offer?.total_amount || null,
          duffel_base_amount: offer?.base_amount || null,
          duffel_currency: offer?.total_currency || null,
          amadeus_total:
            offer?.price?.grandTotal ||
            offer?.price?.total ||
            null,
          amadeus_base: offer?.price?.base || null,
          amadeus_currency: offer?.price?.currency || null,
          travelpayouts_price: offer?.price || null,
          travelpayouts_currency: offer?.currency || null,
          travelpayouts_airline: offer?.airline || null,
        }),
      );
    });

    // ==================== 2. NORMALIZE ====================
    let flights: FlightWithSource[] = rawOffers.map((offer) => {
      // Amadeus
      if (offer._provider === 'amadeus') {
        const normalized = this.normalizer.normalizeAmadeusOffer(
          offer,
          {
            adults: params.adults,
            children: params.children,
            infants: params.infants,
          },
        );
        return {
          ...normalized,
          source: 'amadeus' as const,
          _provider: 'amadeus' as const,
        };
      }

      // Travelpayouts
      if (offer._provider === 'travelpayouts') {
        const normalized =
          this.normalizer.normalizeTravelpayoutsOffer(offer, {
            adults: params.adults,
            children: params.children,
            infants: params.infants,
            cabinClass: params.cabinClass,
          });
        return {
          ...normalized,
          source: 'travelpayouts' as const,
          _provider: 'travelpayouts' as const,
        };
      }

      // Duffel (default)
      const normalized =
        this.normalizer.normalizeDuffelOffer(offer);
      return {
        ...normalized,
        source: 'duffel' as const,
        _provider: 'duffel' as const,
      };
    });

    // ── Debug: normalized (first 5) ──
    flights.slice(0, 5).forEach((flight, index) => {
      this.logFlightPrice(`NORMALIZED_${index + 1}`, flight, {
        source: flight?.source,
      });
    });

    // ==================== 3. FALLBACK IF EMPTY ====================

    // ==================== 4. CONVERT TO SAR ====================
    const sourcesBeforeSAR = flights.map((f) => ({
      id: f.id,
      source: f.source,
      _provider: f._provider,
    }));

    flights = flights.map((f) =>
      this.markupService.convertFlightToSAR(f),
    ) as FlightWithSource[];

    // ✅ source/provider preserve
    flights = flights.map((f, i) => ({
      ...f,
      source: sourcesBeforeSAR[i]?.source || f?.source,
      _provider:
        sourcesBeforeSAR[i]?._provider || f?._provider,
    }));

    flights.slice(0, 5).forEach((flight, index) => {
      this.logFlightPrice(
        `AFTER_SAR_CONVERSION_${index + 1}`,
        flight,
      );
    });

    // ==================== 5. APPLY MARKUP ====================
    if (flights.length > 0) {
      try {
        const markupRules =
          await this.markupService.fetchRules(
            params.agentId || null,
          );

        if (markupRules.length > 0) {
          flights = flights.map((flight) => {
            const savedSource = flight.source;
            const savedProvider = flight._provider;

            const context =
              this.markupService.buildContext(flight, {
                origin: params.origin,
                destination: params.destination,
                agentId: params.agentId,
              });

            const updated =
              this.markupService.applyMarkupToFlight(
                flight,
                markupRules,
                context,
              ) as FlightWithSource;

            // ✅ restore source after markup
            updated.source = savedSource;
            updated._provider = savedProvider;

            this.logFlightPrice('AFTER_MARKUP', updated, {
              route: `${params.origin}-${params.destination}`,
            });

            return updated;
          });
        }
      } catch (error: any) {
        this.logger.warn(
          `Markup apply error (non-fatal): ${error?.message || error}`,
        );
      }
    }

    // ==================== 6. APPLY DISCOUNTS ====================
    if (flights.length > 0) {
      flights = await Promise.all(
        flights.map(async (flight) => {
          try {
            const agent = {
              agentId: params.agentId || null,
              agentTier: params.agentTier || null,
            };

            const ctx =
              this.discountService.buildContext(
                flight,
                agent,
              );

            const discountInfo =
              await this.discountService.resolveDiscounts(
                ctx,
              );

            const updated: FlightWithSource = {
              ...flight,
              discountInfo,
              source: flight.source,
              _provider: flight._provider,
            };

            this.logFlightPrice(
              'FINAL_SHOWN_PRICE',
              updated,
              {
                finalShownPrice:
                  updated?.priceBreakdown?.agentUi
                    ?.grandTotal || null,
                totalDiscount:
                  discountInfo?.totalDiscount || 0,
                labels: discountInfo?.labels || [],
              },
            );

            return updated;
          } catch (error: any) {
            this.logger.warn(
              `Discount apply error (non-fatal): ${error?.message || error}`,
            );
            return flight;
          }
        }),
      );
    }

    // ✅ final provider summary
    const finalProviderSummary = flights.reduce(
      (acc: Record<string, number>, flight: any) => {
        const key =
          flight?.source || flight?._provider || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {},
    );

    this.logger.log(
      `FINAL FLIGHTS SUMMARY => ${JSON.stringify(finalProviderSummary)}`,
    );

    // ==================== RETURN ====================
    return {
      data: flights,
      meta: {
        count: flights.length,
        source: provider,
        currency: 'SAR',
        isFallback,
        providerSummary: finalProviderSummary,

        // ✅ নতুন — কোন provider active/disabled সেটা frontend জানবে
        activeProviders: activeProviderSlugs,
        disabledProviders: disabledProviders,

        request: {
          tripType: params.tripType,
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
          returnDate: params.returnDate,
          cabinClass: params.cabinClass,
          adults: params.adults,
          children: params.children,
          infants: params.infants,
        },
      },
    };
  }

  // ==================== GET AGENT INFO ====================
  async getAgentInfo(agentId: string): Promise<{
    agentId: string;
    agentTier: string | null;
  }> {
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { tier: true },
    });

    return {
      agentId,
      agentTier: agent?.tier ?? null,
    };
  }
}