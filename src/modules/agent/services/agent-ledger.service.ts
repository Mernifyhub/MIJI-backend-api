import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export interface LedgerEntry {
  id: string;
  date: string;
  type: string;
  category: string;
  description: string;
  reference: string;
  invoiceNo: string;
  pnr: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  status: string;
  isCredit: boolean;
  meta: Record<string, unknown>;
}

export interface LedgerPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface LedgerSummary {
  currentBalance: number;
  creditLimit: number;
  usedLimit: number;
  availableCredit: number;
  totalAvailableToBook: number;
  totalCredit: number;
  totalDebit: number;
  totalTransactions: number;
  depositTotal: number;
  bookingTotal: number;
  pendingDepositTotal: number;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  pagination: LedgerPagination;
  summary: LedgerSummary;
}

@Injectable()
export class AgentLedgerService {
  private readonly logger = new Logger(AgentLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // GET LEDGER (with filters + pagination)
  // ──────────────────────────────────────────────
  async getLedger(
    userId: string,
    query: any,
  ): Promise<LedgerResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    // ── Date filter ──
    const dateFilter: any = {};
    if (query.startDate) {
      dateFilter.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      dateFilter.lte = new Date(
        new Date(query.endDate).setHours(23, 59, 59, 999),
      );
    }

    // ── Type filter (Direct enum match OR category match) ──
    let typeFilter: any = undefined;
    if (query.type) {
      const t = String(query.type).toUpperCase();

      // Category-based filter mapping
      const typeMap: Record<string, string[]> = {
        DEPOSIT_GROUP: [
          'DEPOSIT',
          'DEPOSIT_PENDING',
          'DEPOSIT_FAILED',
          'DEPOSIT_REFUNDED',
        ],
        BOOKING_GROUP: [
          'TICKET',
          'TICKET_REQUESTED',
          'ON_HOLD',
          'CANCELLED',
          'VOID',
          'REFUNDED',
          'REISSUE',
        ],
        MANUAL_GROUP: [
          'ACM',
          'ADM',
          'MANUAL_BOOKING',
          'DEDUCTION',
          'DATE_CHANGE',
          'AMOUNT_ADD',
          'CREDIT_LIMIT_ADD',
          'LIMIT_ADJUST',
          'SERVICE',
        ],
        REFUND_GROUP: ['REFUNDED', 'REFUND', 'DEPOSIT_REFUNDED'],
      };

      if (typeMap[t]) {
        typeFilter = { in: typeMap[t] };
      } else {
        // Direct enum match
        typeFilter = t;
      }
    }

    // ── Where clause ──
    const where: any = {
      userId,
      ...(Object.keys(dateFilter).length && {
        createdAt: dateFilter,
      }),
      ...(typeFilter && { type: typeFilter }),
      ...(query.status && { status: String(query.status).toUpperCase() }),
      ...(query.search && {
        OR: [
          {
            description: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
          {
            reference: {
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
            invoiceNo: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ],
      }),
    };

    // ── Parallel queries ──
    const [
      total,
      ledgerEntries,
      user,
      allCredits,
      allDebits,
      depositTotal,
      bookingTotal,
      pendingDeposits,
    ] = await Promise.all([
      this.prisma.agentLedger.count({ where }),

      this.prisma.agentLedger.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),

      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          balance: true,
          creditLimit: true,
          usedLimit: true,
        },
      }),

      this.prisma.agentLedger.aggregate({
        where: { userId, status: 'COMPLETED' },
        _sum: { credit: true },
      }),

      this.prisma.agentLedger.aggregate({
        where: { userId, status: 'COMPLETED' },
        _sum: { debit: true },
      }),

      this.prisma.deposit.aggregate({
        where: { userId, status: 'SUCCESS' },
        _sum: { amount: true },
      }),

      this.prisma.booking.aggregate({
        where: {
          agentId: userId,
          status: { notIn: ['CANCELLED', 'VOIDED', 'REFUNDED'] },
        },
        _sum: { net: true },
      }),

      this.prisma.deposit.aggregate({
        where: { userId, status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    // ── Calculate snapshot ──
    const balance = Number(user?.balance || 0);
    const creditLimit = Number(user?.creditLimit || 0);
    const usedLimit = Number(user?.usedLimit || 0);
    const walletBalance = Math.max(0, balance);
    const availableCredit = Math.max(0, creditLimit - usedLimit);
    const totalAvailableToBook = walletBalance + availableCredit;

    // ── Build entries ──
    const entries: LedgerEntry[] = ledgerEntries.map((entry) =>
      this.formatEntry(entry),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      entries,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      summary: {
        currentBalance: walletBalance,
        creditLimit,
        usedLimit,
        availableCredit,
        totalAvailableToBook,
        totalCredit: Number(allCredits._sum.credit || 0),
        totalDebit: Number(allDebits._sum.debit || 0),
        totalTransactions: total,
        depositTotal: Number(depositTotal._sum.amount || 0),
        bookingTotal: Number(bookingTotal._sum.net || 0),
        pendingDepositTotal: Number(pendingDeposits._sum.amount || 0),
      },
    };
  }

  // ──────────────────────────────────────────────
  // GET LEDGER SUMMARY (lightweight)
  // ──────────────────────────────────────────────
  async getLedgerSummary(userId: string) {
    const [user, allCredits, allDebits, total, depositTotal, bookingTotal] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            balance: true,
            creditLimit: true,
            usedLimit: true,
          },
        }),
        this.prisma.agentLedger.aggregate({
          where: { userId, status: 'COMPLETED' },
          _sum: { credit: true },
        }),
        this.prisma.agentLedger.aggregate({
          where: { userId, status: 'COMPLETED' },
          _sum: { debit: true },
        }),
        this.prisma.agentLedger.count({ where: { userId } }),
        this.prisma.deposit.aggregate({
          where: { userId, status: 'SUCCESS' },
          _sum: { amount: true },
        }),
        this.prisma.booking.aggregate({
          where: {
            agentId: userId,
            status: { notIn: ['CANCELLED', 'VOIDED', 'REFUNDED'] },
          },
          _sum: { net: true },
        }),
      ]);

    const balance = Number(user?.balance || 0);
    const creditLimit = Number(user?.creditLimit || 0);
    const usedLimit = Number(user?.usedLimit || 0);
    const walletBalance = Math.max(0, balance);
    const availableCredit = Math.max(0, creditLimit - usedLimit);

    return {
      currentBalance: walletBalance,
      creditLimit,
      usedLimit,
      availableCredit,
      totalAvailableToBook: walletBalance + availableCredit,
      totalCredit: Number(allCredits._sum.credit || 0),
      totalDebit: Number(allDebits._sum.debit || 0),
      totalTransactions: total,
      depositTotal: Number(depositTotal._sum.amount || 0),
      bookingTotal: Number(bookingTotal._sum.net || 0),
    };
  }

  // ──────────────────────────────────────────────
  // GET SINGLE LEDGER ENTRY
  // ──────────────────────────────────────────────
  async getLedgerEntry(userId: string, entryId: string) {
    const entry = await this.prisma.agentLedger.findFirst({
      where: {
        id: entryId,
        userId,
      },
    });

    if (!entry) {
      throw new NotFoundException('Ledger entry not found');
    }

    return this.formatEntry(entry);
  }

  // ──────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────
  private formatEntry(entry: any): LedgerEntry {
    const isCredit = Number(entry.credit) > 0;

    return {
      id: entry.id,
      date: entry.createdAt.toISOString(),
      type: entry.type,
      category: this.getCategoryLabel(entry.type),
      description: entry.description,
      reference: entry.reference || entry.invoiceNo || entry.id,
      invoiceNo: entry.invoiceNo || '',
      pnr: entry.pnr || '',
      debit: Number(entry.debit || 0),
      credit: Number(entry.credit || 0),
      balanceAfter: Number(entry.balanceAfter || 0),
      status: entry.status,
      isCredit,
      meta: {
        bookingId: entry.bookingId,
        depositId: entry.depositId,
        operationId: entry.operationId,
        pnr: entry.pnr,
        systemPnr: entry.systemPnr,
        flightDate: entry.flightDate,
        note: entry.note,
        createdBy: entry.createdBy,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        currency: entry.currency,
      },
    };
  }

  // ✅ Production-Ready Category Labels
  private getCategoryLabel(type: string): string {
    const labels: Record<string, string> = {
      // ── Standard ──
      OPENING_BALANCE: 'Opening Balance',

      // ── Ticket Lifecycle ──
      TICKET: 'Ticket Issued',
      TICKET_REQUESTED: 'Issue Requested', // ✅ NEW - Pending admin approval
      ON_HOLD: 'On Hold',

      // ── Cancel Lifecycle ──
      CANCELLED: 'Cancelled',
      CANCEL_REQUESTED: 'Cancel Requested', // ✅ Future use

      // ── Void Lifecycle ──
      VOID: 'Void',
      VOIDED: 'Voided',
      VOID_REQUESTED: 'Void Requested', // ✅ Future use

      // ── Refund Lifecycle ──
      REFUNDED: 'Refunded',
      REFUND: 'Refund',
      REFUND_REQUESTED: 'Refund Requested', // ✅ Future use

      // ── Reissue Lifecycle ──
      REISSUE: 'Reissue',
      REISSUE_REQUESTED: 'Reissue Requested', // ✅ Future use

      // ── Other Charges ──
      SERVICE: 'Service Charge',
      DEDUCTION: 'Amount Deduction',
      DATE_CHANGE: 'Date Change',

      // ── Deposit ──
      DEPOSIT: 'Deposit',
      DEPOSIT_PENDING: 'Deposit Pending',
      DEPOSIT_FAILED: 'Deposit Failed',
      DEPOSIT_REFUNDED: 'Deposit Refunded',

      // ── Airline Memos ──
      ACM: 'Agency Credit Memo',
      ADM: 'Agency Debit Memo',

      // ── Manual / Admin ──
      MANUAL_BOOKING: 'Manual Booking',
      AMOUNT_ADD: 'Amount Added',
      CREDIT_LIMIT_ADD: 'Credit Limit Added',
      LIMIT_ADJUST: 'Limit Adjusted',
    };

    return labels[type] || type;
  }
}