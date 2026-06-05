import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LedgerQueryDto } from '../dto/ledger-query.dto';

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
  totalCredit: number;
  totalDebit: number;
  totalTransactions: number;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  pagination: LedgerPagination;
  summary: LedgerSummary;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getLedger(
    userId: string,
    query: LedgerQueryDto,
  ): Promise<LedgerResponse> {
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(query.limit || '20')),
    );
    const skip = (page - 1) * limit;

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

    // ── Type filter ──
    let typeFilter: any = undefined;
    if (query.type && query.type !== 'all') {
      const typeMap: Record<string, string[]> = {
        deposit: [
          'DEPOSIT',
          'DEPOSIT_PENDING',
          'DEPOSIT_FAILED',
          'DEPOSIT_REFUNDED',
        ],
        booking: [
          'TICKET',
          'ON_HOLD',
          'CANCELLED',
          'VOID',
          'REFUNDED',
          'REISSUE',
        ],
        manual: [
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
        refund: ['REFUNDED', 'REFUND', 'DEPOSIT_REFUNDED'],
      };
      typeFilter = {
        in: typeMap[query.type] || [],
      };
    }

    // ── Where clause ──
    const where: any = {
      userId,
      ...(Object.keys(dateFilter).length && {
        createdAt: dateFilter,
      }),
      ...(typeFilter && { type: typeFilter }),
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
    const [total, ledgerEntries, user, allCredits, allDebits] =
      await Promise.all([
        this.prisma.agentLedger.count({ where }),

        this.prisma.agentLedger.findMany({
          where,
          orderBy: { createdAt: 'desc' },
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
          where: { userId },
          _sum: { credit: true },
        }),

        this.prisma.agentLedger.aggregate({
          where: { userId },
          _sum: { debit: true },
        }),
      ]);

    // ── Build entries ──
    const entries: LedgerEntry[] = ledgerEntries.map((entry) => {
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
        },
      };
    });

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
        currentBalance: Number(user?.balance || 0),
        creditLimit: Number(user?.creditLimit || 0),
        usedLimit: Number(user?.usedLimit || 0),
        totalCredit: Number(
          allCredits._sum.credit || 0,
        ),
        totalDebit: Number(allDebits._sum.debit || 0),
        totalTransactions: total,
      },
    };
  }

  private getCategoryLabel(type: string): string {
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
      ACM: 'Agency Credit Memo',
      ADM: 'Agency Debit Memo',
      MANUAL_BOOKING: 'Manual Booking',
      DEDUCTION: 'Amount Deduction',
      DATE_CHANGE: 'Date Change',
      AMOUNT_ADD: 'Amount Added',
      CREDIT_LIMIT_ADD: 'Credit Limit Added',
      LIMIT_ADJUST: 'Limit Adjusted',
    };
    return labels[type] || type;
  }
}