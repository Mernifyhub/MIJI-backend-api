import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { getAccountSnapshot } from 'src/common/lib/accounting';

@Injectable()
export class AdminLedgerService {
  private readonly logger = new Logger(AdminLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // GET ANY AGENT'S LEDGER (admin access)
  // ──────────────────────────────────────────────
  async getAgentLedger(
    agentId: string,
    query?: {
      page?: number;
      limit?: number;
      type?: string;
      sourceType?: string;
      status?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, Math.max(1, query?.limit || 10));
    const skip = (page - 1) * limit;
    const sortOrder = query?.sortOrder || 'desc';

    // ── Verify agent exists ──
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        agentId: true,
        agentName: true,
        balance: true,
        creditLimit: true,
        usedLimit: true,
      },
    });

    if (!agent) throw new NotFoundException('Agent not found');

    // ── Where build ──
    const where: any = { userId: agentId };

    if (query?.type) where.type = query.type.toUpperCase();
    if (query?.sourceType) where.sourceType = query.sourceType.toUpperCase();
    if (query?.status) where.status = query.status.toUpperCase();

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }

    if (query?.search?.trim()) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
        { pnr: { contains: query.search, mode: 'insensitive' } },
        { invoiceNo: { contains: query.search, mode: 'insensitive' } },
        { systemPnr: { contains: query.search, mode: 'insensitive' } },
        { note: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // ── Parallel queries ──
    const [entries, total, debitAgg, creditAgg, depositAgg, bookingAgg, pendingDepositAgg] =
      await Promise.all([
        this.prisma.agentLedger.findMany({
          where,
          orderBy: { createdAt: sortOrder },
          skip,
          take: limit,
        }),
        this.prisma.agentLedger.count({ where }),
        this.prisma.agentLedger.aggregate({
          where: { userId: agentId, status: 'COMPLETED' },
          _sum: { debit: true },
        }),
        this.prisma.agentLedger.aggregate({
          where: { userId: agentId, status: 'COMPLETED' },
          _sum: { credit: true },
        }),
        this.prisma.deposit.aggregate({
          where: { userId: agentId, status: 'SUCCESS' },
          _sum: { amount: true },
        }),
        this.prisma.booking.aggregate({
          where: {
            agentId,
            status: { notIn: ['CANCELLED', 'VOIDED', 'REFUNDED'] },
          },
          _sum: { net: true },
        }),
        this.prisma.deposit.aggregate({
          where: { userId: agentId, status: 'PENDING' },
          _sum: { amount: true },
        }),
      ]);

    // ── Account snapshot ──
    const snapshot = getAccountSnapshot({
      balance: agent.balance,
      creditLimit: agent.creditLimit,
      usedLimit: agent.usedLimit,
    });

    // ── Format entries ──
    const formattedEntries = entries.map((e) => this.formatEntry(e));

    return {
      // ✅ Agent info (admin কে agent details দেখাতে হবে)
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        agentName: agent.agentName,
      },

      entries: formattedEntries,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },

      summary: {
        currentBalance: snapshot.walletBalance,
        rawBalance: snapshot.rawBalance,
        creditLimit: snapshot.creditLimit,
        usedLimit: snapshot.usedLimit,
        availableCredit: snapshot.availableCredit,
        totalAvailableToBook: snapshot.totalAvailableToBook,
        totalCredit: Number(creditAgg._sum.credit || 0),
        totalDebit: Number(debitAgg._sum.debit || 0),
        totalTransactions: total,
        depositTotal: Number(depositAgg._sum.amount || 0),
        bookingTotal: Number(bookingAgg._sum.net || 0),
        pendingDepositTotal: Number(pendingDepositAgg._sum.amount || 0),
      },
    };
  }

  // ──────────────────────────────────────────────
  // GET ALL AGENTS LEDGER OVERVIEW
  // ──────────────────────────────────────────────
  async getAllAgentsOverview(query?: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, Math.max(1, query?.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { role: 'USER' };

    if (query?.search?.trim()) {
      where.OR = [
        { agentName: { contains: query.search, mode: 'insensitive' } },
        { agentId: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [agents, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          agentId: true,
          agentName: true,
          email: true,
          balance: true,
          creditLimit: true,
          usedLimit: true,
          status: true,
          tier: true,
          _count: {
            select: {
              agentLedgers: true,
              bookings: true,
              deposits: true,
            },
          },
        },
        orderBy: { agentName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const formattedAgents = agents.map((a) => {
      const snapshot = getAccountSnapshot({
        balance: a.balance,
        creditLimit: a.creditLimit,
        usedLimit: a.usedLimit,
      });

      return {
        id: a.id,
        agentId: a.agentId,
        agentName: a.agentName,
        email: a.email,
        status: a.status,
        tier: a.tier,
        walletBalance: snapshot.walletBalance,
        creditLimit: snapshot.creditLimit,
        usedLimit: snapshot.usedLimit,
        availableCredit: snapshot.availableCredit,
        totalAvailableToBook: snapshot.totalAvailableToBook,
        totalLedgerEntries: a._count.agentLedgers,
        totalBookings: a._count.bookings,
        totalDeposits: a._count.deposits,
      };
    });

    return {
      agents: formattedAgents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ──────────────────────────────────────────────
  // GET SINGLE ENTRY (admin access)
  // ──────────────────────────────────────────────
  async getEntry(entryId: string) {
    const entry = await this.prisma.agentLedger.findUnique({
      where: { id: entryId },
    });
    if (!entry) throw new NotFoundException('Ledger entry not found');
    return this.formatEntry(entry);
  }

  // ──────────────────────────────────────────────
  // ADD MANUAL LEDGER ENTRY (admin only)
  // ──────────────────────────────────────────────
  async addManualEntry(
    adminId: string,
    data: {
      agentId: string;
      type: string;
      debit?: number;
      credit?: number;
      description: string;
      reference?: string;
      pnr?: string;
      note?: string;
    },
  ) {
    // Verify agent
    const agent = await this.prisma.user.findUnique({
      where: { id: data.agentId },
      select: { id: true, balance: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const debit = Number(data.debit || 0);
    const credit = Number(data.credit || 0);
    const balanceAfter = Number(agent.balance || 0) + credit - debit;

    // ── Transaction ──
    const entry = await this.prisma.$transaction(async (tx) => {
      // Update agent balance
      await tx.user.update({
        where: { id: data.agentId },
        data: { balance: balanceAfter },
      });

      // Create ledger entry
      const ledgerEntry = await tx.agentLedger.create({
        data: {
          userId: data.agentId,
          type: data.type as any,
          sourceType: 'ADMIN',
          debit,
          credit,
          balanceAfter,
          description: data.description,
          reference: data.reference,
          pnr: data.pnr,
          note: data.note,
          status: 'COMPLETED',
          createdBy: adminId,
          invoiceNo: `MAN-${Date.now()}`,
        },
      });

      return ledgerEntry;
    });

    return this.formatEntry(entry);
  }

  // ──────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────
  private formatEntry(e: any) {
    return {
      id: e.id,
      date: e.createdAt.toISOString(),
      type: e.type,
      category: this.getTypeLabel(e.type),
      sourceType: e.sourceType,
      isCredit: Number(e.credit || 0) > 0,
      debit: Number(e.debit || 0),
      credit: Number(e.credit || 0),
      balanceAfter: Number(e.balanceAfter || 0),
      description: e.description,
      reference: e.reference || e.invoiceNo || e.bookingId || e.id,
      invoiceNo: e.invoiceNo,
      pnr: e.pnr,
      systemPnr: e.systemPnr,
      status: e.status,
      meta: {
        pnr: e.pnr,
        systemPnr: e.systemPnr,
        bookingId: e.bookingId,
        depositId: e.depositId,
        operationId: e.operationId,
        flightDate: e.flightDate,
        note: e.note,
        createdBy: e.createdBy,
        sourceId: e.sourceId,
        currency: e.currency,
      },
    };
  }

  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      OPENING_BALANCE: 'Opening Balance',
      TICKET: 'Ticket Issued',
      ON_HOLD: 'On Hold',
      CANCELLED: 'Cancelled',
      VOID: 'Void',
      VOIDED: 'Voided',
      REFUNDED: 'Refunded',
      REISSUE: 'Reissue',
      SERVICE: 'Service Charge',
      DEPOSIT: 'Deposit',
      DEPOSIT_PENDING: 'Deposit Pending',
      DEPOSIT_FAILED: 'Deposit Failed',
      DEPOSIT_REFUNDED: 'Deposit Refunded',
      REFUND: 'Refund',
      ACM: 'ACM',
      ADM: 'ADM',
      MANUAL_BOOKING: 'Manual Booking',
      DEDUCTION: 'Deduction',
      DATE_CHANGE: 'Date Change',
      AMOUNT_ADD: 'Amount Added',
      CREDIT_LIMIT_ADD: 'Credit Limit Added',
      LIMIT_ADJUST: 'Limit Adjustment',
    };
    return labels[type] || type;
  }
}