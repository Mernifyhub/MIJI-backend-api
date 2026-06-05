// src/payment/services/payment-balance.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { getAccountSnapshot } from 'src/common/lib/accounting';

const MANUAL_CREDIT_TYPES = ['refund', 'acm', 'amount_add'];
const MANUAL_DEBIT_TYPES = [
  'manual_booking',
  'adm',
  'amount_deduct',
  'date_change',
];

// ─────────────────────────────────────────
// Mismatch tolerance (floating point এর জন্য)
// ─────────────────────────────────────────
const BALANCE_TOLERANCE = 0.01;

@Injectable()
export class PaymentBalanceService {
  private readonly logger = new Logger(PaymentBalanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAgentBalance(agentId: string) {
    // ─────────────────────────────────────
    // সব data একসাথে fetch করো
    // ─────────────────────────────────────
    const [
      user,
      successDeposits,
      refundedDeposits,
      manualOps,
    ] = await Promise.all([
      // 1) User account info
      this.prisma.user.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          balance: true,
          creditLimit: true,
          usedLimit: true,
        },
      }),

      // 2) Successful deposits (টাকা ঢুকেছে)
      this.prisma.deposit.aggregate({
        where: {
          userId: agentId,
          status: 'SUCCESS',
        },
        _sum: { amount: true },
      }),

      // 3) Refunded deposits (টাকা ফেরত গেছে)
      this.prisma.deposit.aggregate({
        where: {
          userId: agentId,
          status: 'REFUNDED',
        },
        _sum: { amount: true },
      }),

      // 4) Manual operations (credit/debit)
      this.prisma.manualOperation.findMany({
        where: {
          userId: agentId,
          status: 'COMPLETED',
          type: {
            in: [...MANUAL_CREDIT_TYPES, ...MANUAL_DEBIT_TYPES],
          },
        },
        select: {
          type: true,
          amount: true,
        },
      }),

      // ─────────────────────────────────────
      // ✅ totalBookingAmount এখানে নেই
      //
      // কারণ: booking create এর সময়
      // AgentBookingService → computeBookingPayment() ব্যবহার করে
      // user.balance থেকে already deduct হয়ে যাচ্ছে।
      //
      // তাই এখানে আবার booking amount বাদ দিলে
      // double counting হবে এবং mismatch দেখাবে।
      // ─────────────────────────────────────
    ]);

    // User না থাকলে error
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ─────────────────────────────────────
    // Deposit calculations
    // ─────────────────────────────────────
    const totalDeposited = Number(successDeposits._sum.amount ?? 0);
    const totalDepositRefunded = Number(refundedDeposits._sum.amount ?? 0);
    const netDeposited = totalDeposited - totalDepositRefunded;

    // ─────────────────────────────────────
    // Manual operation calculations
    // ─────────────────────────────────────
    let manualCredit = 0;
    let manualDebit = 0;

    for (const op of manualOps) {
      const amount = Number(op.amount ?? 0);
      if (MANUAL_CREDIT_TYPES.includes(op.type)) {
        manualCredit += amount;
      }
      if (MANUAL_DEBIT_TYPES.includes(op.type)) {
        manualDebit += amount;
      }
    }

    // ─────────────────────────────────────────────────────────
    // ✅ Computed Balance Formula (accounting.ts এর সাথে consistent)
    //
    // computedBalance = deposits - deposit_refunds + manual_credits - manual_debits
    //
    // Booking amount এখানে বাদ দেওয়া হচ্ছে না।
    // কারণ booking এর সময় user.balance থেকে real-time deduct হয়।
    // stored balance ই এখানে source of truth।
    // ─────────────────────────────────────────────────────────
    const computedBalance =
      netDeposited +
      manualCredit -
      manualDebit;

    // ─────────────────────────────────────
    // accounting.ts এর getAccountSnapshot use করো
    // এটা walletBalance, availableCredit etc. সঠিকভাবে calculate করে
    // ─────────────────────────────────────
    const snapshot = getAccountSnapshot({
      balance: user.balance,
      creditLimit: user.creditLimit,
      usedLimit: user.usedLimit,
    });

    // ─────────────────────────────────────
    // Mismatch check
    //
    // stored = user.balance (real-time, booking এ deduct হয়)
    // computed = deposits + manual ops (historical records)
    //
    // এই দুটো সব সময় মিলবে না যদি:
    // 1. DB তে directly balance set করা হয়
    // 2. Deposit record ছাড়া balance দেওয়া হয়
    //
    // Mismatch detect করবো কিন্তু auto-fix করবো না।
    // ─────────────────────────────────────
    const storedBalance = snapshot.rawBalance;
    const diff = Math.abs(storedBalance - computedBalance);

    if (diff > BALANCE_TOLERANCE) {
      this.logger.warn(
        `Balance mismatch detected for agentId=${agentId} | ` +
        `stored=${storedBalance} | ` +
        `computed=${computedBalance} | ` +
        `diff=${diff.toFixed(4)} | ` +
        `deposits=${totalDeposited} | ` +
        `deposit_refunds=${totalDepositRefunded} | ` +
        `manual_credit=${manualCredit} | ` +
        `manual_debit=${manualDebit}`
      );
    }

    // ─────────────────────────────────────
    // Return
    // ─────────────────────────────────────
    return {
      // ✅ Main balance values (accounting.ts snapshot থেকে)
      balance: snapshot.walletBalance,
      walletBalance: snapshot.walletBalance,
      rawBalance: snapshot.rawBalance,

      // ✅ Credit info
      creditLimit: snapshot.creditLimit,
      usedLimit: snapshot.usedLimit,
      availableCredit: snapshot.availableCredit,
      remainingCredit: snapshot.availableCredit,

      // ✅ Total available to book
      totalAvailable: snapshot.totalAvailableToBook,
      totalAvailableToBook: snapshot.totalAvailableToBook,

      // ✅ Audit / debug info
      storedBalance,
      computedBalance,
      isMismatch: diff > BALANCE_TOLERANCE,
      mismatchAmount: diff > BALANCE_TOLERANCE ? diff : 0,

      // ✅ Transaction breakdown
      totalDeposited,
      totalDepositRefunded,
      netDeposited,
      manualCredit,
      manualDebit,
    };
  }

  // ─────────────────────────────────────────────────────────
  // ✅ Balance sync utility
  // Mismatch হলে manually call করে fix করা যাবে
  // ─────────────────────────────────────────────────────────
  async syncBalance(agentId: string): Promise<{
    old: number;
    new: number;
    diff: number;
  }> {
    const result = await this.getAgentBalance(agentId);

    if (!result.isMismatch) {
      this.logger.log(
        `Balance already in sync for agentId=${agentId}, balance=${result.storedBalance}`
      );
      return {
        old: result.storedBalance,
        new: result.storedBalance,
        diff: 0,
      };
    }

    // ✅ stored balance কে computed balance দিয়ে update করো
    await this.prisma.user.update({
      where: { id: agentId },
      data: { balance: result.computedBalance },
    });

    this.logger.log(
      `Balance synced for agentId=${agentId} | ` +
      `old=${result.storedBalance} | ` +
      `new=${result.computedBalance} | ` +
      `diff=${result.mismatchAmount}`
    );

    return {
      old: result.storedBalance,
      new: result.computedBalance,
      diff: result.mismatchAmount,
    };
  }

  // ─────────────────────────────────────────────────────────
  // ✅ Missing deposit record করার utility
  // যদি manually balance দেওয়া হয়ে থাকে সেটা record করতে
  // ─────────────────────────────────────────────────────────
  async recordMissingBalance(
    agentId: string,
    amount: number,
    description = 'Balance correction',
  ): Promise<void> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    await this.prisma.manualOperation.create({
      data: {
        userId: agentId,
        type: 'amount_add', // MANUAL_CREDIT_TYPES এ আছে
        amount,
        status: 'COMPLETED',
        description,
      },
    });

    this.logger.log(
      `Missing balance recorded for agentId=${agentId}, amount=${amount}`
    );
  }
}