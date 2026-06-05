// src/modules/flights/controllers/flight-search.controller.ts
import {Controller,Get,Query,UseGuards,Logger,UseInterceptors,} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import { FlightSearchService } from '../services/flight-search.service';
import { FlightSearchDto } from '../dto/flight-search.dto';
import type {FlightSearchParams,SearchSlice,} from '../types/flight.types';
import { TimeoutInterceptor } from 'src/common/interceptors/timeout.interceptor';

@Controller('flights')
@UseInterceptors(new TimeoutInterceptor(60000))
export class FlightSearchController {
  private readonly logger = new Logger(FlightSearchController.name);

  constructor(
    private readonly flightSearchService: FlightSearchService,
  ) {}

  // ── GET /api/v1/flights/search ──
  // Public — guest users can search
  // Logged-in users get agent pricing via cookie
  @Get('search')
  async search(
    @Query() query: FlightSearchDto,
  ) {
    this.logger.log(
      `Flight search: ${query.origin} → ${query.destination} | ${query.departureDate}`,
    );

    // Try to get userId from cookie (optional auth)
    // Since no guard, userId will be undefined for guests
    const params = await this.buildParams(query);
    return this.flightSearchService.search(params);
  }

  // ── GET /api/v1/flights/search/agent ──
  // Auth required — agent gets personalized pricing
  @Get('search/agent')
  @UseGuards(JwtAuthGuard)
  async searchAsAgent(
    @Query() query: FlightSearchDto,
    @GetUser('id') userId: string,
  ) {
    this.logger.log(
      `Agent flight search: ${query.origin} → ${query.destination} | agent: ${userId}`,
    );

    const params = await this.buildParams(query, userId);
    return this.flightSearchService.search(params);
  }

  // ── Build search params ──
  private async buildParams(
    query: FlightSearchDto,
    userId?: string,
  ): Promise<FlightSearchParams> {
    const tripType = (query.tripType || 'ONE_WAY') as FlightSearchParams['tripType'];
    const origin = (query.origin || '').toUpperCase().trim();
    const destination = (query.destination || '').toUpperCase().trim();
    const departureDate = this.ensureFutureDate(query.departureDate || '');
    const returnDate = query.returnDate || null;

    // ✅ travelClass or cabinClass — accept either
    const cabinClass = (query.cabinClass ||query.travelClass ||'economy').toLowerCase();

    const adults = Math.max(1, Number(query.adults || 1));
    const children = Math.max(0, Number(query.children || 0));
    const infants = Math.max(0, Number(query.infants || 0));
    const provider = (query.provider || 'duffel') as FlightSearchParams['provider'];

    // ── Build slices ──
    let slices: SearchSlice[] = [];

    if (tripType === 'MULTI_CITY' && query.segments) {
      try {
        const parsed = JSON.parse(query.segments);
        if (Array.isArray(parsed)) {
          slices = parsed
            .filter(
              (s: any) =>
                s?.origin && s?.destination && (s?.departureDate || s?.departure_date),
            )
            .map((s: any) => ({
              origin: (s.origin || '').toUpperCase().trim(),
              destination: (s.destination || '').toUpperCase().trim(),
              departure_date: this.ensureFutureDate(
                s.departureDate || s.departure_date || '',
              ),
            }));
        }
      } catch (e) {
        this.logger.warn('Failed to parse segments JSON:', e);
      }
    }

    if (slices.length === 0) {
      slices = [
        {
          origin,
          destination,
          departure_date: departureDate,
        },
      ];

      if (tripType === 'ROUND_TRIP' && returnDate) {
        slices.push({
          origin: destination,
          destination: origin,
          departure_date: this.ensureFutureDate(returnDate),
        });
      }
    }

    // ── Agent info ──
    let agentId: string | undefined;
    let agentTier: string | null = null;

    if (userId) {
      try {
        const agentInfo =
          await this.flightSearchService.getAgentInfo(userId);
        agentId = agentInfo.agentId;
        agentTier = agentInfo.agentTier;
      } catch (e) {
        this.logger.warn('Failed to get agent info:', e);
      }
    }

    return {
      tripType,
      origin,
      destination,
      departureDate,
      returnDate,
      cabinClass,
      adults,
      children,
      infants,
      slices,
      provider,
      agentId,
      agentTier: agentTier || undefined,
    };
  }

  // ── Ensure date is in future ──
  private ensureFutureDate(input: string): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    if (!input) {
      return tomorrow.toISOString().split('T')[0];
    }

    const date = new Date(input);

    if (isNaN(date.getTime()) || date <= tomorrow) {
      return tomorrow.toISOString().split('T')[0];
    }

    return input;
  }
}