import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [
      totalBookings,
      todayBookings,
      totalRevenue,
      todayRevenue,
      totalAgents,
      pendingAgents,
      pendingDeposits,
      todayDeposits,
      todayConfirm,
      recentBookings,
      recentDeposits,
      topAgents,
      issueCount,
      reissueCount,
      cancelCount,
      voidCount,
      refundCount,
    ] = await Promise.all([
      // Total bookings
      this.prisma.booking.count(),

      // Today's bookings
      this.prisma.booking.count({
        where: { createdAt: { gte: todayStart } },
      }),

      // Total revenue (confirmed)
      this.prisma.booking.aggregate({
        where: { status: 'CONFIRMED' },
        _sum: { gross: true },
      }),

      // Today's revenue
      this.prisma.booking.aggregate({
        where: {
          status: 'CONFIRMED',
          createdAt: { gte: todayStart },
        },
        _sum: { gross: true },
      }),

      // Total agents
      this.prisma.user.count({
        where: { role: 'USER' },
      }),

      // Pending agents
      this.prisma.user.count({
        where: { role: 'USER', status: 'PENDING' },
      }),

      // Pending deposits
      this.prisma.deposit.count({
        where: { status: 'PENDING' },
      }),

      // Today's deposits amount
      this.prisma.deposit.aggregate({
        where: {
          status: 'SUCCESS',
          createdAt: { gte: todayStart },
        },
        _sum: { amount: true },
      }),

      // Today's confirmed tickets
      this.prisma.booking.count({
        where: {
          status: 'CONFIRMED',
          createdAt: { gte: todayStart },
        },
      }),

      // Recent bookings
      this.prisma.booking.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          passengers: { take: 1 },
          agent: {
            select: { agentName: true, email: true },
          },
        },
      }),

      // Recent deposits
      this.prisma.deposit.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { agentName: true, email: true },
          },
        },
      }),

      // Top agents
      this.prisma.user.findMany({
        where: { role: 'USER' },
        take: 5,
        orderBy: { bookings: { _count: 'desc' } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          agentName: true,
          _count: { select: { bookings: true } },
        },
      }),

      // Request counts
      this.prisma.bookingRequest.count({
        where: {
          type: 'ISSUE',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
      this.prisma.bookingRequest.count({
        where: {
          type: 'REISSUE',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
      this.prisma.bookingRequest.count({
        where: {
          type: 'CANCEL',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
      this.prisma.bookingRequest.count({
        where: {
          type: 'VOID',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
      this.prisma.bookingRequest.count({
        where: {
          type: 'REFUND',
          status: { in: ['PENDING', 'PROCESSING'] },
        },
      }),
    ]);

    // ── Format top agents ──
    const formattedTopAgents = topAgents.map((agent, index) => ({
      id: agent.id,
      name:
        agent.agentName ||
        `${agent.firstName || ''} ${agent.lastName || ''}`.trim(),
      bookings: agent._count.bookings,
      revenue: `SAR ${(agent._count.bookings * 450).toLocaleString()}`,
      status: 'active',
      avatar:
        (agent.firstName?.[0] || '') + (agent.lastName?.[0] || ''),
      growth: 12 + index * 2,
    }));

    // ── Format bookings ──
    const formattedBookings = recentBookings.map((b) => ({
      id: b.id,
      pnr: b.pnr,
      passenger:
        b.passengers[0]
          ? `${b.passengers[0].firstName} ${b.passengers[0].lastName}`
          : 'N/A',
      route: b.route,
      date: b.departureDate.toISOString().split('T')[0],
      amount: `SAR ${Number(b.gross || 0).toLocaleString()}`,
      status: b.status.toLowerCase(),
      agent: b.agent?.agentName || 'Unknown',
    }));

    // ── Format deposits ──
    const formattedDeposits = recentDeposits.map((d) => ({
      id: d.id,
      agent: d.user?.agentName || 'Unknown Agent',
      amount: `SAR ${Number(d.amount || 0).toLocaleString()}`,
      method: d.method.replace('_', ' '),
      date: d.createdAt.toISOString().split('T')[0],
      status: d.status.toLowerCase(),
      reference: d.reference || `DEP-${d.id.slice(0, 6)}`,
    }));

    return {
      stats: {
        totalBookings,
        todayBookings,
        totalRevenue: Number(totalRevenue._sum.gross || 0),
        todayRevenue: Number(todayRevenue._sum.gross || 0),
        totalAgents,
        pendingAgents,
        pendingDeposits,
        todayDeposits: Number(todayDeposits._sum.amount || 0),
        todayConfirm,
      },
      recentBookings: formattedBookings,
      recentDeposits: formattedDeposits,
      topAgents: formattedTopAgents,
      requestStats: {
        ISSUE: issueCount,
        REISSUE: reissueCount,
        CANCEL: cancelCount,
        VOID: voidCount,
        REFUND: refundCount,
      },
    };
  }
}