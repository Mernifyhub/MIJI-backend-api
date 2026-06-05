import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

// ── Date Range Query ──
export interface DateRangeQuery {
  range?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ── Exported so controller can use ──
export interface StatData {
  value: number;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
}

export interface TopRoute {
  route: string;
  count: number;
  percentage: number;
}

export interface ReportSummary {
  ticketedAmount: number;
  bookingCount: number;
  profitLoss: number;
  totalFlyer: number;
  commission: number;
  depositAmount: number;
  avgTicketValue: number;
  conversionRate: number;
  profitMargin: number;
}

export interface ReportStats {
  searchCount: StatData;
  agentCount: StatData;
  totalFlyer: StatData;
  totalSegments: StatData;
  bookingCount: StatData;
  issueCount: StatData;
  bookingCancelled: StatData;
  pendingBookings: StatData;
  ticketedAmount: StatData;
  depositAmount: StatData;
  depositCount: StatData;
  lossProfit: StatData;
  commission: StatData;
  refundCount: StatData;
  refundAmount: StatData;
  reissueCount: StatData;
  reissueAmount: StatData;
  voidCount: StatData;
  voidAmount: StatData;
}

export interface AllReportResponse {
  success: boolean;
  stats: ReportStats;
  summary: ReportSummary;
  topRoutes: TopRoute[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

@Injectable()
export class AgentReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllReport(
    agentId: string,
    query: DateRangeQuery,
  ): Promise<AllReportResponse> {
    // ── Calculate date range ──
    const { startDate, endDate } = this.getDateRange(
      query.range || 'today',
      query.dateFrom,
      query.dateTo,
    );

    const dateFilter = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };

    // ── Fetch bookings in current period ──
    const bookings = await this.prisma.booking.findMany({
      where: {
        agentId,
        bookingDate: dateFilter,
      },
      include: {
        passengers: { select: { type: true } },
        segments: { select: { from: true, to: true } },
      },
    });

    // ── Group by status ──
    const confirmedBookings = bookings.filter((b) => b.status === 'CONFIRMED');
    const onHoldBookings = bookings.filter((b) => b.status === 'ON_HOLD');
    const cancelledBookings = bookings.filter((b) => b.status === 'CANCELLED');
    const voidedBookings = bookings.filter((b) => b.status === 'VOIDED');
    const refundedBookings = bookings.filter((b) => b.status === 'REFUNDED');

    // ── Calculate booking totals ──
    const totalPax = bookings.reduce(
      (sum, b) => sum + b.passengers.length,
      0,
    );
    const totalSegments = bookings.reduce(
      (sum, b) => sum + (b.segments?.length || 0),
      0,
    );

    const ticketedAmount = confirmedBookings.reduce(
      (sum, b) => sum + Number(b.gross || 0),
      0,
    );
    const totalCommission = confirmedBookings.reduce(
      (sum, b) => sum + Number(b.commission || 0),
      0,
    );
    const refundAmount = refundedBookings.reduce(
      (sum, b) => sum + Number(b.gross || 0),
      0,
    );
    const voidAmount = voidedBookings.reduce(
      (sum, b) => sum + Number(b.gross || 0),
      0,
    );
    const profitLoss = ticketedAmount - refundAmount - voidAmount;

    // ── Fetch deposits ──
    // ✅ FIX: status string check remove করে raw fetch করছি
    // তারপর JS-এ filter করছি — Prisma enum type conflict এড়াতে
    const allDeposits = await this.prisma.deposit.findMany({
      where: {
        userId: agentId,
        createdAt: dateFilter,
      },
      select: {
        amount: true,
        status: true,
      },
    });

    // ✅ FIX: String conversion দিয়ে compare করছি
    // এতে Prisma enum type error হবে না
    const approvedDeposits = allDeposits.filter(
      (d) => String(d.status) === 'APPROVED' || String(d.status) === 'COMPLETED',
    );
    const pendingDeposits = allDeposits.filter(
      (d) => String(d.status) === 'PENDING',
    );

    const depositAmount = approvedDeposits.reduce(
      (sum, d) => sum + Number(d.amount || 0),
      0,
    );
    const pendingDepositTotal = pendingDeposits.reduce(
      (sum, d) => sum + Number(d.amount || 0),
      0,
    );

    // ── Top Routes ──
    const routeCounts: Record<string, number> = {};
    bookings.forEach((b) => {
      if (b.route) {
        routeCounts[b.route] = (routeCounts[b.route] || 0) + 1;
      }
    });

    const topRoutes: TopRoute[] = Object.entries(routeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([route, count]) => ({
        route,
        count,
        percentage:
          bookings.length > 0
            ? Math.round((count / bookings.length) * 100)
            : 0,
      }));

    // ── Build stat helper ──
    const makeStat = (value: number, change = 0): StatData => ({
      value,
      change: Math.abs(change),
      changeType:
        change > 0 ? 'increase' : change < 0 ? 'decrease' : 'neutral',
    });

    // ── Stats object ──
    const stats: ReportStats = {
      searchCount: makeStat(0),
      agentCount: makeStat(1),
      totalFlyer: makeStat(totalPax),
      totalSegments: makeStat(totalSegments),
      bookingCount: makeStat(bookings.length),
      issueCount: makeStat(confirmedBookings.length),
      bookingCancelled: makeStat(cancelledBookings.length),
      pendingBookings: makeStat(onHoldBookings.length),
      ticketedAmount: makeStat(ticketedAmount),
      depositAmount: makeStat(depositAmount),
      depositCount: makeStat(approvedDeposits.length),
      lossProfit: makeStat(profitLoss, profitLoss > 0 ? 5 : -3),
      commission: makeStat(totalCommission),
      refundCount: makeStat(refundedBookings.length),
      refundAmount: makeStat(refundAmount),
      reissueCount: makeStat(0),
      reissueAmount: makeStat(0),
      voidCount: makeStat(voidedBookings.length),
      voidAmount: makeStat(voidAmount),
    };

    // ── Summary ──
    const avgTicketValue =
      confirmedBookings.length > 0
        ? Math.round(ticketedAmount / confirmedBookings.length)
        : 0;

    const conversionRate =
      bookings.length > 0
        ? Math.round((confirmedBookings.length / bookings.length) * 100)
        : 0;

    const profitMargin =
      ticketedAmount > 0
        ? Math.round((profitLoss / ticketedAmount) * 100)
        : 0;

    const summary: ReportSummary = {
      ticketedAmount,
      bookingCount: confirmedBookings.length,
      profitLoss,
      totalFlyer: totalPax,
      commission: totalCommission,
      depositAmount,
      avgTicketValue,
      conversionRate,
      profitMargin,
    };

    return {
      success: true,
      stats,
      summary,
      topRoutes,
      dateRange: {
        startDate: this.formatDateString(startDate),
        endDate: this.formatDateString(endDate),
      },
    };
  }

  // ── Date Range Calculator ──
  private getDateRange(
    range: string,
    dateFrom?: string,
    dateTo?: string,
  ): { startDate: string; endDate: string } {
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Custom date range
    if (dateFrom && dateTo) {
      return { startDate: dateFrom, endDate: dateTo };
    }

    switch (range) {
      case 'today':
        return {
          startDate: today.toISOString(),
          endDate: new Date(
            today.getTime() + 86400000 - 1,
          ).toISOString(),
        };

      case 'yesterday': {
        const yesterday = new Date(today.getTime() - 86400000);
        return {
          startDate: yesterday.toISOString(),
          endDate: new Date(
            yesterday.getTime() + 86400000 - 1,
          ).toISOString(),
        };
      }

      case '7days':
        return {
          startDate: new Date(
            today.getTime() - 7 * 86400000,
          ).toISOString(),
          endDate: now.toISOString(),
        };

      case '30days':
        return {
          startDate: new Date(
            today.getTime() - 30 * 86400000,
          ).toISOString(),
          endDate: now.toISOString(),
        };

      case 'thisMonth':
        return {
          startDate: new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
          ).toISOString(),
          endDate: now.toISOString(),
        };

      case 'lastMonth': {
        const firstDay = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        );
        const lastDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
          999,
        );
        return {
          startDate: firstDay.toISOString(),
          endDate: lastDay.toISOString(),
        };
      }

      case 'thisYear':
        return {
          startDate: new Date(
            now.getFullYear(),
            0,
            1,
          ).toISOString(),
          endDate: now.toISOString(),
        };

      case 'all':
        return {
          startDate: new Date(2020, 0, 1).toISOString(),
          endDate: now.toISOString(),
        };

      default:
        return {
          startDate: today.toISOString(),
          endDate: now.toISOString(),
        };
    }
  }

  // ── Date Formatter ──
  private formatDateString(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}