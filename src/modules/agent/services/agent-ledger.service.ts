import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { getAccountSnapshot } from 'src/common/lib/accounting';

@Injectable()
export class AgentLedgerService {
  private readonly logger = new Logger(AgentLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // GET LEDGER (paginated, filtered, with summary)
  // ──────────────────────────────────────────────
  async getLedger(
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

    // ── Where filter ──
    const where: any = { userId: agentId };

    if (query?.type) where.type = query.type.toUpperCase();
    if (query?.sourceType) where.sourceType = query.sourceType.toUpperCase();
    if (query?.status) where.status = query.status.toUpperCase();

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        where.createdAt.lte = new Date(`${query.endDate}T23:59:59.999Z`);
      }
    }

    if (query?.search) {
      const searchTerm = query.search.trim();
      if (searchTerm) {
        where.OR = [
          { description: { contains: searchTerm, mode: 'insensitive' } },
          { reference: { contains: searchTerm, mode: 'insensitive' } },
          { pnr: { contains: searchTerm, mode: 'insensitive' } },
          { invoiceNo: { contains: searchTerm, mode: 'insensitive' } },
          { systemPnr: { contains: searchTerm, mode: 'insensitive' } },
          { note: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }
    }

    // ── Parallel queries ──
    const [
      entries,
      total,
      user,
      debitAgg,
      creditAgg,
      depositAgg,
      bookingAgg,
      pendingDepositAgg,
    ] = await Promise.all([
      this.prisma.agentLedger.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip,
        take: limit,
      }),
      this.prisma.agentLedger.count({ where }),
      this.prisma.user.findUnique({
        where: { id: agentId },
        select: {
          balance: true,
          creditLimit: true,
          usedLimit: true,
        },
      }),
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

    if (!user) throw new NotFoundException('User not found');

    const snapshot = getAccountSnapshot({
      balance: user.balance,
      creditLimit: user.creditLimit,
      usedLimit: user.usedLimit,
    });

    const formattedEntries = entries.map((entry) =>
      this.formatEntry(entry),
    );

    const totalDebit = Number(debitAgg._sum.debit || 0);
    const totalCredit = Number(creditAgg._sum.credit || 0);
    const depositTotal = Number(depositAgg._sum.amount || 0);
    const bookingTotal = Number(bookingAgg._sum.net || 0);
    const pendingDepositTotal = Number(pendingDepositAgg._sum.amount || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      entries: formattedEntries,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      summary: {
        currentBalance: snapshot.walletBalance,
        rawBalance: snapshot.rawBalance,
        creditLimit: snapshot.creditLimit,
        usedLimit: snapshot.usedLimit,
        availableCredit: snapshot.availableCredit,
        totalAvailableToBook: snapshot.totalAvailableToBook,
        totalCredit,
        totalDebit,
        netFlow: totalCredit - totalDebit,
        totalTransactions: total,
        depositTotal,
        bookingTotal,
        pendingDepositTotal,
      },
    };
  }

  // ──────────────────────────────────────────────
  // GET SINGLE LEDGER ENTRY
  // ──────────────────────────────────────────────
  async getLedgerEntry(agentId: string, entryId: string) {
    const entry = await this.prisma.agentLedger.findFirst({
      where: { id: entryId, userId: agentId },
    });

    if (!entry) throw new NotFoundException('Ledger entry not found');

    return this.formatEntry(entry);
  }

  // ──────────────────────────────────────────────
  // GET LEDGER SUMMARY ONLY
  // ──────────────────────────────────────────────
  async getLedgerSummary(agentId: string) {
    const [user, debitAgg, creditAgg, countAgg] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: agentId },
        select: {
          balance: true,
          creditLimit: true,
          usedLimit: true,
        },
      }),
      this.prisma.agentLedger.aggregate({
        where: { userId: agentId, status: 'COMPLETED' },
        _sum: { debit: true },
      }),
      this.prisma.agentLedger.aggregate({
        where: { userId: agentId, status: 'COMPLETED' },
        _sum: { credit: true },
      }),
      this.prisma.agentLedger.count({
        where: { userId: agentId },
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    const snapshot = getAccountSnapshot({
      balance: user.balance,
      creditLimit: user.creditLimit,
      usedLimit: user.usedLimit,
    });

    return {
      currentBalance: snapshot.walletBalance,
      rawBalance: snapshot.rawBalance,
      creditLimit: snapshot.creditLimit,
      usedLimit: snapshot.usedLimit,
      availableCredit: snapshot.availableCredit,
      totalAvailableToBook: snapshot.totalAvailableToBook,
      totalCredit: Number(creditAgg._sum.credit || 0),
      totalDebit: Number(debitAgg._sum.debit || 0),
      netFlow:
        Number(creditAgg._sum.credit || 0) -
        Number(debitAgg._sum.debit || 0),
      totalTransactions: countAgg,
    };
  }

  // ──────────────────────────────────────────────
  // ✅ CONFIRM BOOKING: ON_HOLD → TICKET
  // ──────────────────────────────────────────────
  async confirmBookingLedger(
    agentId: string,
    bookingId: string,
    data: {
      amount: number;
      pnr?: string;
      systemPnr?: string;
      description?: string;
      reference?: string;
      invoiceNo?: string;
      flightDate?: string;
      createdBy?: string;
    },
  ) {
    this.logger.log(
      `[confirmBookingLedger] agentId=${agentId} | bookingId=${bookingId} | pnr=${data.pnr}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      // ── Find ALL ON_HOLD entries for this booking ──
      const holdEntries = await tx.agentLedger.findMany({
        where: {
          userId: agentId,
          bookingId: bookingId,
          type: 'ON_HOLD',
        },
      });

      if (holdEntries.length > 0) {
        // ── Update ALL ON_HOLD → TICKET ──
        await tx.agentLedger.updateMany({
          where: {
            userId: agentId,
            bookingId: bookingId,
            type: 'ON_HOLD',
          },
          data: {
            type: 'TICKET',
            status: 'COMPLETED',
            description:
              data.description ||
              `Ticket Issued | PNR: ${data.pnr || 'N/A'}`,
            pnr: data.pnr || undefined,
            systemPnr: data.systemPnr || undefined,
            invoiceNo: data.invoiceNo || undefined,
            reference: data.reference || undefined,
            
          },
        });

        this.logger.log(
          `✅ Updated ${holdEntries.length} ON_HOLD → TICKET | bookingId=${bookingId}`,
        );
      } else {
        // ── No ON_HOLD found → Create fresh TICKET entry ──
        this.logger.warn(
          `⚠️ No ON_HOLD entries for bookingId=${bookingId}. Creating new TICKET entry.`,
        );

        const user = await tx.user.findUnique({
          where: { id: agentId },
          select: {
            balance: true,
            creditLimit: true,
            usedLimit: true,
          },
        });

        if (!user) throw new NotFoundException('User not found');

        const walletBalance = Math.max(0, Number(user.balance || 0));
        const usedLimit = Number(user.usedLimit || 0);
        const amount = Number(data.amount || 0);

        const fromWallet = Math.min(walletBalance, amount);
        const fromCredit = Math.max(0, amount - fromWallet);
        const newBalance = Math.max(0, walletBalance - fromWallet);
        const newUsedLimit = usedLimit + fromCredit;

        await tx.user.update({
          where: { id: agentId },
          data: {
            balance: newBalance,
            usedLimit: newUsedLimit,
          },
        });

        await tx.agentLedger.create({
          data: {
            userId: agentId,
            bookingId: bookingId,
            type: 'TICKET',
            sourceType: 'BOOKING',
            sourceId: bookingId,
            debit: amount,
            credit: 0,
            balanceAfter: newBalance,
            currency: 'SAR',
            status: 'COMPLETED',
            description:
              data.description ||
              `Ticket Issued | PNR: ${data.pnr || 'N/A'}`,
            pnr: data.pnr || null,
            systemPnr: data.systemPnr || null,
            invoiceNo:
              data.invoiceNo || `INV-${bookingId}-TICKET`,
            reference: data.reference || bookingId,
            flightDate: data.flightDate
              ? new Date(data.flightDate)
              : null,
            createdBy: data.createdBy || 'SYSTEM',
          },
        });

        this.logger.log(
          `✅ Created new TICKET entry | bookingId=${bookingId} | amount=${amount}`,
        );
      }

      return {
        success: true,
        bookingId,
        type: 'TICKET',
        updatedCount: holdEntries.length,
      };
    });
  }

  // ──────────────────────────────────────────────
  // ✅ CANCEL BOOKING: ON_HOLD / TICKET → CANCELLED
  // ──────────────────────────────────────────────
  async cancelBookingLedger(
    agentId: string,
    bookingId: string,
    data: {
      refundAmount?: number;
      description?: string;
      createdBy?: string;
      pnr?: string;
    },
  ) {
    this.logger.log(
      `[cancelBookingLedger] agentId=${agentId} | bookingId=${bookingId}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      // ── Update all active entries to CANCELLED ──
      const updated = await tx.agentLedger.updateMany({
        where: {
          userId: agentId,
          bookingId: bookingId,
          type: { in: ['ON_HOLD', 'TICKET'] },
        },
        data: {
          type: 'CANCELLED',
          status: 'COMPLETED',
          description: data.description || 'Booking Cancelled',
        },
      });

      this.logger.log(
        `✅ Cancelled ${updated.count} ledger entries | bookingId=${bookingId}`,
      );

      // ── If refund → create REFUNDED credit entry ──
      if (data.refundAmount && data.refundAmount > 0) {
        const user = await tx.user.findUnique({
          where: { id: agentId },
          select: { balance: true, usedLimit: true },
        });

        if (user) {
          const walletBalance = Math.max(0, Number(user.balance || 0));
          const usedLimit = Number(user.usedLimit || 0);
          const refund = Number(data.refundAmount);

          // Repay credit first, then add to balance
          const creditRepaid = Math.min(refund, usedLimit);
          const balanceAdded = refund - creditRepaid;
          const newBalance = walletBalance + balanceAdded;
          const newUsedLimit = Math.max(0, usedLimit - creditRepaid);

          await tx.user.update({
            where: { id: agentId },
            data: {
              balance: newBalance,
              usedLimit: newUsedLimit,
            },
          });

          await tx.agentLedger.create({
            data: {
              userId: agentId,
              bookingId: bookingId,
              type: 'REFUNDED',
              sourceType: 'BOOKING',
              sourceId: bookingId,
              credit: refund,
              debit: 0,
              balanceAfter: newBalance,
              currency: 'SAR',
              status: 'COMPLETED',
              description:
                data.description || 'Booking Cancellation Refund',
              pnr: data.pnr || null,
              invoiceNo: `INV-${bookingId}-REFUND`,
              createdBy: data.createdBy || 'SYSTEM',
            },
          });

          this.logger.log(
            `✅ Refund entry created | bookingId=${bookingId} | amount=${refund}`,
          );
        }
      }

      return {
        success: true,
        bookingId,
        type: 'CANCELLED',
        updatedCount: updated.count,
      };
    });
  }

  // ──────────────────────────────────────────────
  // ✅ VOID BOOKING: → VOIDED
  // ──────────────────────────────────────────────
  async voidBookingLedger(
    agentId: string,
    bookingId: string,
    data: {
      refundAmount?: number;
      description?: string;
      createdBy?: string;
      pnr?: string;
    },
  ) {
    this.logger.log(
      `[voidBookingLedger] agentId=${agentId} | bookingId=${bookingId}`,
    );

    return await this.prisma.$transaction(async (tx) => {
      await tx.agentLedger.updateMany({
        where: {
          userId: agentId,
          bookingId: bookingId,
          type: { in: ['ON_HOLD', 'TICKET'] },
        },
        data: {
          type: 'VOID',
          status: 'COMPLETED',
          description: data.description || 'Booking Voided',
        },
      });

      // Refund if applicable
      if (data.refundAmount && data.refundAmount > 0) {
        const user = await tx.user.findUnique({
          where: { id: agentId },
          select: { balance: true, usedLimit: true },
        });

        if (user) {
          const walletBalance = Math.max(0, Number(user.balance || 0));
          const usedLimit = Number(user.usedLimit || 0);
          const refund = Number(data.refundAmount);

          const creditRepaid = Math.min(refund, usedLimit);
          const balanceAdded = refund - creditRepaid;
          const newBalance = walletBalance + balanceAdded;
          const newUsedLimit = Math.max(0, usedLimit - creditRepaid);

          await tx.user.update({
            where: { id: agentId },
            data: {
              balance: newBalance,
              usedLimit: newUsedLimit,
            },
          });

          await tx.agentLedger.create({
            data: {
              userId: agentId,
              bookingId: bookingId,
              type: 'REFUNDED',
              sourceType: 'BOOKING',
              sourceId: bookingId,
              credit: refund,
              debit: 0,
              balanceAfter: newBalance,
              currency: 'SAR',
              status: 'COMPLETED',
              description: data.description || 'Void Refund',
              pnr: data.pnr || null,
              invoiceNo: `INV-${bookingId}-VOID`,
              createdBy: data.createdBy || 'SYSTEM',
            },
          });
        }
      }

      return { success: true, bookingId, type: 'VOIDED' };
    });
  }

  // ──────────────────────────────────────────────
  // PRIVATE: Format Entry for Frontend
  // ──────────────────────────────────────────────
  private formatEntry(entry: any) {
    return {
      id: entry.id,
      date: entry.createdAt.toISOString(),
      type: entry.type,
      category: this.getTypeLabel(entry.type),
      sourceType: entry.sourceType,
      isCredit: Number(entry.credit || 0) > 0,
      debit: Number(entry.debit || 0),
      credit: Number(entry.credit || 0),
      balanceAfter: Number(entry.balanceAfter || 0),
      description: entry.description,
      reference:
        entry.reference ||
        entry.invoiceNo ||
        entry.bookingId ||
        entry.id,
      invoiceNo: entry.invoiceNo,
      pnr: entry.pnr,
      systemPnr: entry.systemPnr,
      status: entry.status,
      meta: {
        pnr: entry.pnr,
        systemPnr: entry.systemPnr,
        bookingId: entry.bookingId,
        depositId: entry.depositId,
        operationId: entry.operationId,
        flightDate: entry.flightDate,
        note: entry.note,
        createdBy: entry.createdBy,
        sourceId: entry.sourceId,
        currency: entry.currency,
      },
    };
  }

  // ──────────────────────────────────────────────
  // PRIVATE: Type → Label
  // ──────────────────────────────────────────────
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