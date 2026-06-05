import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export interface SalesEntry {
  id: string;
  date: string;
  booking: string;
  pnr: string;
  route: string;
  origin: string;
  destination: string;
  pax: number;
  amount: number;
  currency: string;
  agent: string;
  agentName: string;
  status: string;
  commission: number;
  ticketType: string;
}

export interface SalesStats {
  totalSales: number;
  totalCommission: number;
  totalPax: number;
  bookingCount: number;
  avgTicketPrice: number;
}

export interface SalesResponse {
  success: boolean;
  data: SalesEntry[];
  total: number;
  page: number;
  totalPages: number;
  stats: SalesStats;
}

@Injectable()
export class AgentSalesService {
  private readonly logger = new Logger(AgentSalesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSales(
    agentId: string,
    query: {
      page?: string;
      limit?: string;
      search?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: string;
    },
  ): Promise<SalesResponse> {
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(query.limit || '10')),
    );
    const skip = (page - 1) * limit;
    const sortOrder = (
      query.sortOrder || 'desc'
    ) as 'asc' | 'desc';

    // ── Where clause ──
    const where: any = { agentId };

    // Search
    if (query.search) {
      where.OR = [
        {
          bookingId: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          pnr: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          route: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          carrier: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    // Status
    if (query.status) {
      const statusMap: Record<string, string> = {
        confirmed: 'CONFIRMED',
        pending: 'ON_HOLD',
        cancelled: 'CANCELLED',
        voided: 'VOIDED',
        refunded: 'REFUNDED',
      };
      where.status =
        statusMap[query.status.toLowerCase()] ||
        query.status.toUpperCase();
    }

    // Date range
    if (query.dateFrom || query.dateTo) {
      where.bookingDate = {};
      if (query.dateFrom) {
        where.bookingDate.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const endDate = new Date(query.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.bookingDate.lte = endDate;
      }
    }

    // Sort
    const sortFieldMap: Record<string, string> = {
      date: 'bookingDate',
      amount: 'gross',
      pax: 'bookingDate',
    };
    const orderByField =
      sortFieldMap[query.sortBy || 'date'] || 'bookingDate';

    try {
      // ── Parallel queries ──
      const [total, bookings, confirmedBookings] =
        await Promise.all([
          this.prisma.booking.count({ where }),

          this.prisma.booking.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [orderByField]: sortOrder },
            include: {
              agent: {
                select: {
                  agentName: true,
                  email: true,
                },
              },
              passengers: {
                select: { type: true },
              },
              segments: {
                select: { from: true, to: true },
                orderBy: { departure: 'asc' },
                take: 1,
              },
            },
          }),

          this.prisma.booking.findMany({
            where: {
              agentId,
              status: 'CONFIRMED',
            },
            select: {
              gross: true,
              commission: true,
              passengers: {
                select: { type: true },
              },
            },
          }),
        ]);

      // ── Stats ──
      const totalPax = confirmedBookings.reduce(
        (sum, b) => sum + b.passengers.length,
        0,
      );
      const totalSales = confirmedBookings.reduce(
        (sum, b) => sum + Number(b.gross || 0),
        0,
      );
      const totalCommission = confirmedBookings.reduce(
        (sum, b) => sum + Number(b.commission || 0),
        0,
      );
      const bookingCount = confirmedBookings.length;
      const avgTicketPrice =
        bookingCount > 0 ? totalSales / bookingCount : 0;

      // ── Maps ──
      const frontendStatusMap: Record<string, string> = {
        CONFIRMED: 'confirmed',
        ON_HOLD: 'pending',
        CANCELLED: 'cancelled',
        VOIDED: 'cancelled',
        REFUNDED: 'refunded',
      };

      const tripTypeMap: Record<string, string> = {
        ONE_WAY: 'One Way',
        ROUND_TRIP: 'Round Trip',
        MULTI_CITY: 'Multi City',
      };

      // ── Transform ──
      const data: SalesEntry[] = bookings.map((booking) => {
        const firstSeg = booking.segments?.[0];
        const origin =
          firstSeg?.from ||
          booking.route?.split('-')[0]?.trim() ||
          '';
        const destination =
          firstSeg?.to ||
          booking.route?.split('-').pop()?.trim() ||
          '';

        return {
          id: booking.id,
          date: booking.bookingDate.toISOString(),
          booking: booking.bookingId,
          pnr: booking.pnr || '',
          route: booking.route || '',
          origin,
          destination,
          pax: booking.passengers.length,
          amount: Number(booking.gross || 0),
          currency: booking.currency || 'SAR',
          agent: booking.agent?.email || '',
          agentName: booking.agent?.agentName || 'N/A',
          status:
            frontendStatusMap[booking.status] || 'pending',
          commission: Number(booking.commission || 0),
          ticketType:
            tripTypeMap[booking.tripType] || 'One Way',
        };
      });

      return {
        success: true,
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        stats: {
          totalSales,
          totalCommission,
          totalPax,
          bookingCount,
          avgTicketPrice,
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Sales fetch error: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }
}