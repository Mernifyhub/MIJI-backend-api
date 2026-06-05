// src/agent/services/agent-dashboard.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const MANUAL_CREDIT_TYPES = ['refund', 'acm', 'amount_add'];
const MANUAL_DEBIT_TYPES = [
  'manual_booking',
  'adm',
  'amount_deduct',
  'date_change',
];

const manualTypeLabels: Record<string, string> = {
  refund: 'Ticket Refund',
  acm: 'Agency Credit Memo',
  adm: 'Agency Debit Memo',
  manual_booking: 'Manual Booking',
  amount_deduct: 'Amount Deduction',
  date_change: 'Date Change',
  add_credit: 'Credit Limit Added',
  limit_add: 'Credit Limit Adjusted',
  amount_add: 'Amount Added',
};

@Injectable()
export class AgentDashboardService {
  private readonly logger = new Logger(AgentDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getTier(
    totalBookings: number,
  ): 'bronze' | 'silver' | 'gold' | 'platinum' {
    if (totalBookings >= 100) return 'platinum';
    if (totalBookings >= 50) return 'gold';
    if (totalBookings >= 20) return 'silver';
    return 'bronze';
  }

  async getDashboard(userId: string) {
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const weekAgo = new Date(
      today.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const monthAgo = new Date(
      today.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    const yearAgo = new Date(
      today.getTime() - 365 * 24 * 60 * 60 * 1000,
    );

    const [
      user,
      totalBookings,
      todayBookings,
      weekBookings,
      monthBookings,
      yearBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      revenueData,
      recentBookings,
      recentDeposits,
      recentManualOps,
      successDeposits,
      refundedDeposits,
      manualOpsForBalance,
    ] = await Promise.all([
      // ── User ──
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          agentName: true,
          agentId: true,
          aviationNumber: true,
          role: true,
          balance: true,
          creditLimit: true,
          usedLimit: true,
          tier: true,
          verified: true,
          createdAt: true,
        },
      }),

      // ── Booking Counts ──
      this.prisma.booking.count({
        where: { agentId: userId },
      }),
      this.prisma.booking.count({
        where: { agentId: userId, createdAt: { gte: today } },
      }),
      this.prisma.booking.count({
        where: { agentId: userId, createdAt: { gte: weekAgo } },
      }),
      this.prisma.booking.count({
        where: { agentId: userId, createdAt: { gte: monthAgo } },
      }),
      this.prisma.booking.count({
        where: { agentId: userId, createdAt: { gte: yearAgo } },
      }),

      // ── Status Counts ──
      this.prisma.booking.count({
        where: { agentId: userId, status: 'CONFIRMED' },
      }),
      this.prisma.booking.count({
        where: { agentId: userId, status: 'ON_HOLD' },
      }),
      this.prisma.booking.count({
        where: { agentId: userId, status: 'CANCELLED' },
      }),

      // ── Revenue ──
      this.prisma.booking.aggregate({
        where: {
          agentId: userId,
          status: { in: ['CONFIRMED', 'ON_HOLD'] },
        },
        _sum: { gross: true, net: true },
      }),

      // ── Recent Bookings ──
      this.prisma.booking.findMany({
        where: { agentId: userId },
        include: { passengers: { take: 1 } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // ── Recent Deposits ──
      this.prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // ── Recent Manual Ops ──
      this.prisma.manualOperation.findMany({
        where: { userId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),

      // ── Deposit Totals ──
      this.prisma.deposit.aggregate({
        where: { userId, status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.deposit.aggregate({
        where: { userId, status: 'REFUNDED' },
        _sum: { amount: true },
      }),

      // ── Manual Ops for Balance ──
      this.prisma.manualOperation.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          type: {
            in: [...MANUAL_CREDIT_TYPES, ...MANUAL_DEBIT_TYPES],
          },
        },
        select: { type: true, amount: true },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ── Balance Computation ──
    const totalDeposited = Number(
      successDeposits._sum.amount || 0,
    );
    const totalDepositRefunded = Number(
      refundedDeposits._sum.amount || 0,
    );

    let manualCredit = 0;
    let manualDebit = 0;

    for (const op of manualOpsForBalance) {
      const amount = Number(op.amount || 0);
      if (MANUAL_CREDIT_TYPES.includes(op.type)) {
        manualCredit += amount;
      }
      if (MANUAL_DEBIT_TYPES.includes(op.type)) {
        manualDebit += amount;
      }
    }

    const totalBookingAmount =
      await this.prisma.booking.aggregate({
        where: {
          agentId: userId,
          status: {
            notIn: ['CANCELLED', 'VOIDED', 'REFUNDED'],
          },
        },
        _sum: { net: true },
      });

    const totalBooked = Number(
      totalBookingAmount._sum.net || 0,
    );

    const computedBalance =
      totalDeposited -
      totalDepositRefunded +
      manualCredit -
      manualDebit -
      totalBooked;

    const storedBalance = Number(user.balance || 0);
    const finalBalance = storedBalance;

    if (storedBalance !== computedBalance) {
      this.logger.warn(
        `Balance mismatch: userId=${userId}, stored=${storedBalance}, computed=${computedBalance}, diff=${storedBalance - computedBalance}`,
      );
    }

    const creditLimit = Number(user.creditLimit || 0);
    const usedLimit = Number(user.usedLimit || 0);
    const availableCredit = Math.max(
      0,
      creditLimit - usedLimit,
    );
    const totalAvailable = finalBalance + availableCredit;

    const totalSales = Number(revenueData._sum.gross || 0);
    const totalNet = Number(revenueData._sum.net || 0);
    const totalCommission = totalSales - totalNet;

    // ── Response ──
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        agentId: user.agentId,
        agencyName: user.agentName,
        memberSince: new Date(
          user.createdAt,
        ).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        tier:
          user.tier?.toLowerCase() ||
          this.getTier(totalBookings),
        verified: user.verified,
      },

      stats: {
        totalBookings,
        todayBookings,
        weekBookings,
        monthBookings,
        yearBookings,
        totalSales,
        totalCommission,
        currentBalance: finalBalance,
        balance: finalBalance,
        availableBalance: finalBalance,
        walletBalance: finalBalance,
        creditLimit,
        usedLimit,
        usedCredit: usedLimit,
        availableCredit,
        remainingCredit: availableCredit,
        totalAvailable,
        computedBalance,
        storedBalance,
        totalDeposited,
      },

      statusCounts: {
        confirmed: confirmedBookings,
        pending: pendingBookings,
        cancelled: cancelledBookings,
      },

      recentBookings: recentBookings.map((booking) => ({
        id: booking.id,
        pnr: booking.pnr,
        bookingId: booking.bookingId,
        passenger: booking.passengers[0]
          ? `${booking.passengers[0].firstName} ${booking.passengers[0].lastName}`
          : 'N/A',
        route: booking.route,
        date: booking.departureDate,
        amount: booking.gross,
        status: booking.status.toLowerCase(),
        airline: booking.carrier,
      })),

      recentPayments: [
        ...recentDeposits.map((deposit) => ({
          id: deposit.id,
          type: deposit.method.toLowerCase(),
          description: `Deposit via ${deposit.method}`,
          amount: Number(deposit.amount),
          date: deposit.createdAt,
          status: deposit.status.toLowerCase(),
          source: 'deposit',
          isCredit: deposit.status === 'SUCCESS',
        })),
        ...recentManualOps.map((op) => ({
          id: op.id,
          type: op.type,
          description: `${manualTypeLabels[op.type] || op.type}${
            op.pnr ? ` - PNR: ${op.pnr}` : ''
          }`,
          amount: Number(op.amount),
          date: op.createdAt,
          status: op.status.toLowerCase(),
          source: 'manual_operation',
          isCredit: MANUAL_CREDIT_TYPES.includes(op.type),
        })),
      ]
        .sort(
          (a, b) =>
            new Date(b.date).getTime() -
            new Date(a.date).getTime(),
        )
        .slice(0, 5),
    };
  }
}