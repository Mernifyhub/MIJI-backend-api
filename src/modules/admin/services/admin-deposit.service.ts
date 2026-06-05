// src/modules/admin/services/admin-deposit.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { computeDepositApplication } from 'src/common/lib/accounting';
import { PaymentMethod } from '@prisma/client';
import { AgentNotificationService } from 'src/modules/agent/services/agent-notification.service';

@Injectable()
export class AdminDepositService {
  private readonly logger = new Logger(AdminDepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: AgentNotificationService
  ) {}

  // ──────────────────────────────────
  // GET ALL DEPOSITS
  // ──────────────────────────────────
  async getAllDeposits(query?: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page  = Math.max(1, query?.page || 1);
    const limit = Math.min(100, query?.limit || 20);
    const skip  = (page - 1) * limit;

    const where: any = {};

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query?.search?.trim()) {
      where.OR = [
        { reference:     { contains: query.search, mode: 'insensitive' } },
        { transactionId: { contains: query.search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { agentName: { contains: query.search, mode: 'insensitive' } },
              { agentId:   { contains: query.search, mode: 'insensitive' } },
              { email:     { contains: query.search, mode: 'insensitive' } },
              { phone:     { contains: query.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [deposits, total] = await Promise.all([
      this.prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id:          true,
              agentId:     true,
              agentName:   true,
              email:       true,
              phone:       true,
              balance:     true,
              creditLimit: true,
              usedLimit:   true,
            },
          },
        },
      }),
      this.prisma.deposit.count({ where }),
    ]);

    const [pendingAgg, approvedAgg, failedAgg] = await Promise.all([
      this.prisma.deposit.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.deposit.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.deposit.aggregate({
        where: { status: 'FAILED' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalCount, todayCount] = await Promise.all([
      this.prisma.deposit.count(),
      this.prisma.deposit.count({ where: { createdAt: { gte: today } } }),
    ]);

    return {
      deposits: deposits.map((d) => this.formatDeposit(d)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total:          totalCount,
        pending:        pendingAgg._count,
        approved:       approvedAgg._count,
        rejected:       failedAgg._count,
        pendingAmount:  Number(pendingAgg._sum.amount  || 0),
        approvedAmount: Number(approvedAgg._sum.amount || 0),
        totalAmount:
          Number(pendingAgg._sum.amount  || 0) +
          Number(approvedAgg._sum.amount || 0) +
          Number(failedAgg._sum.amount   || 0),
        todayRequests: todayCount,
      },
    };
  }

  // ──────────────────────────────────
  // GET SINGLE DEPOSIT
  // ──────────────────────────────────
  async getDepositById(id: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id:          true,
            agentId:     true,
            agentName:   true,
            email:       true,
            phone:       true,
            balance:     true,
            creditLimit: true,
            usedLimit:   true,
          },
        },
      },
    });

    if (!deposit) throw new NotFoundException('Deposit not found');
    return this.formatDeposit(deposit);
  }

  // ──────────────────────────────────
  // APPROVE DEPOSIT
  // ──────────────────────────────────
 async approveDeposit(id: string, adminId: string, adminEmail: string) {
  
  const result = await this.prisma.$transaction(async (tx) => {

    const deposit = await tx.deposit.findUnique({ where: { id } });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.status !== 'PENDING') {
      throw new BadRequestException('Deposit is already processed');
    }

    const agent = await tx.user.findUnique({
      where: { id: deposit.userId },
      select: {
        id:          true,
        agentName:   true,
        firstName:   true,
        lastName:    true,
        balance:     true,
        creditLimit: true,
        usedLimit:   true,
      },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    const application = computeDepositApplication({
      balance:   agent.balance,
      usedLimit: agent.usedLimit,
      amount:    deposit.amount,
    });

    const updatedDeposit = await tx.deposit.update({
      where: { id },
      data: {
        status:     'SUCCESS',
        approvedAt: new Date(),
        approvedBy: adminEmail || adminId,
        notes:
          application.appliedToCredit > 0
            ? `Approved. Credit repaid: ${application.appliedToCredit} SAR${application.addedToWallet > 0 ? `, Wallet added: ${application.addedToWallet} SAR` : ''}`
            : `Approved. Wallet added: ${application.addedToWallet} SAR`,
      },
    });

    await tx.user.update({
      where: { id: agent.id },
      data: {
        balance:   application.newBalance,
        usedLimit: application.newUsedLimit,
      },
    });

    await tx.agentLedger.create({
      data: {
        userId:       agent.id,
        type:         'DEPOSIT',
        sourceType:   'DEPOSIT',
        sourceId:     deposit.id,
        depositId:    deposit.id,
        credit:       Number(deposit.amount),
        debit:        0,
        balanceAfter: application.newBalance,
        currency:     deposit.currency || 'SAR',
        description:  `Deposit approved | Amount: ${deposit.amount} SAR | Method: ${deposit.method}${application.appliedToCredit > 0 ? ` | Credit repaid: ${application.appliedToCredit} SAR` : ''}`,
        reference:    deposit.reference || deposit.id,
        status:       'COMPLETED',
        createdBy:    adminEmail || 'Admin',
        invoiceNo:    `DEP-${deposit.id}`,
      },
    });

    // ✅ Notification create
    await tx.notification.create({
      data: {
        userId: agent.id,
        type: 'approval',
        title: 'Deposit Approved ✅',
        message:
          application.appliedToCredit > 0
            ? application.addedToWallet > 0
              ? `Your deposit of SAR ${deposit.amount} has been approved. Credit repaid: SAR ${application.appliedToCredit}, Wallet added: SAR ${application.addedToWallet}.`
              : `Your deposit of SAR ${deposit.amount} has been approved. Credit repaid: SAR ${application.appliedToCredit}.`
            : `Your deposit of SAR ${deposit.amount} has been approved. Wallet added: SAR ${application.addedToWallet}.`,
        action: '/user/deposits',
        read: false,
      },
    });

    return {
      deposit: updatedDeposit,
      before: {
        balance:   application.walletBalance,
        usedLimit: application.usedLimit,
      },
      after: {
        balance:   application.newBalance,
        usedLimit: application.newUsedLimit,
      },
      breakdown: {
        depositAmount: application.amount,
        creditRepaid:  application.appliedToCredit,
        balanceAdded:  application.addedToWallet,
      },
      agentName: agent.agentName || `${agent.firstName} ${agent.lastName}`,
    };
  });

  this.logger.log(
    `✅ Deposit approved | ID: ${id} | Agent: ${result.agentName} | Amount: ${result.breakdown.depositAmount} SAR`,
  );

  return {
    success: true,
    message: 'Deposit approved successfully',
    deposit: {
      id:         result.deposit.id,
      status:     result.deposit.status,
      amount:     result.deposit.amount,
      approvedAt: result.deposit.approvedAt,
    },
    summary: {
      depositAmount: result.breakdown.depositAmount,
      creditRepaid:  result.breakdown.creditRepaid,
      balanceAdded:  result.breakdown.balanceAdded,
      message:
        result.breakdown.creditRepaid > 0
          ? result.breakdown.balanceAdded > 0
            ? `Credit repaid: ${result.breakdown.creditRepaid} SAR | Wallet added: ${result.breakdown.balanceAdded} SAR`
            : `Credit repaid: ${result.breakdown.creditRepaid} SAR`
          : `Wallet added: ${result.breakdown.balanceAdded} SAR`,
    },
    before: result.before,
    after:  result.after,
  };
}
  
  // ──────────────────────────────────
  // REJECT DEPOSIT
  // ──────────────────────────────────
  async rejectDeposit(
    id: string,
    adminId: string,
    adminEmail: string,
    rejectionNote: string,
  ) {
    if (!rejectionNote?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    const deposit = await this.prisma.deposit.findUnique({ where: { id } });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.status !== 'PENDING') {
      throw new BadRequestException('Deposit is already processed');
    }

    const updatedDeposit = await this.prisma.deposit.update({
      where: { id },
      data: {
        status:        'FAILED',
        rejectedAt:    new Date(),
        rejectionNote,
        approvedBy:    adminEmail || adminId,
      },
    });

    this.logger.log(`❌ Deposit rejected | ID: ${id}`);

    return {
      success: true,
      message: 'Deposit rejected successfully',
      deposit: updatedDeposit,
    };
  }

  // ──────────────────────────────────
  // CREATE MANUAL DEPOSIT
  // ──────────────────────────────────
  async createManualDeposit(
    dto: {
      userId: string;
      amount: number;
      currency?: string;
      method?: string;
      transactionId?: string;
      reference?: string;
      notes?: string;
      status?: 'SUCCESS' | 'PENDING';
    },
    adminId: string,
    adminEmail: string,
  ) {
    if (!dto.userId) {
      throw new BadRequestException('Agent (userId) is required');
    }
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const agent = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id:          true,
        agentId:     true,
        agentName:   true,
        firstName:   true,
        lastName:    true,
        balance:     true,
        creditLimit: true,
        usedLimit:   true,
        email:       true,
        phone:       true,
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agent not found with id: ${dto.userId}`);
    }

    const finalStatus   = dto.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
    const isAutoApprove = finalStatus === 'SUCCESS';

    const result = await this.prisma.$transaction(async (tx) => {
      const reference =
        dto.reference ||
        `MAN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      // ✅ method string কে PaymentMethod enum এ cast করো
      const paymentMethod: PaymentMethod =
        Object.values(PaymentMethod).includes(dto.method as PaymentMethod)
          ? (dto.method as PaymentMethod)
          : PaymentMethod.MANUAL;

      const deposit = await tx.deposit.create({
        data: {
          userId:        dto.userId,
          amount:        dto.amount,
          currency:      dto.currency || 'SAR',
          method:        paymentMethod,
          transactionId: dto.transactionId || null,
          reference,
          notes:         dto.notes || null,
          status:        finalStatus,

          ...(isAutoApprove && {
            approvedAt: new Date(),
            approvedBy: adminEmail || adminId,
          }),
        },
      });

      if (isAutoApprove) {
        const application = computeDepositApplication({
          balance:   agent.balance,
          usedLimit: agent.usedLimit,
          amount:    dto.amount,
        });

        await tx.user.update({
          where: { id: agent.id },
          data: {
            balance:   application.newBalance,
            usedLimit: application.newUsedLimit,
          },
        });

        await tx.agentLedger.create({
          data: {
            userId:       agent.id,
            type:         'DEPOSIT',
            sourceType:   'DEPOSIT',
            sourceId:     deposit.id,
            depositId:    deposit.id,
            credit:       Number(dto.amount),
            debit:        0,
            balanceAfter: application.newBalance,
            currency:     dto.currency || 'SAR',
            description:  `Manual deposit by admin | Amount: ${dto.amount} SAR | Method: ${paymentMethod}${
              application.appliedToCredit > 0
                ? ` | Credit repaid: ${application.appliedToCredit} SAR`
                : ''
            }`,
            reference,
            status:    'COMPLETED',
            createdBy: adminEmail || 'Admin',
            invoiceNo: `MAN-${deposit.id}`,
          },
        });

        return {
          deposit,
          application,
          agentName:     agent.agentName || `${agent.firstName} ${agent.lastName}`,
          isAutoApprove: true,
        };
      }

      return {
        deposit,
        application:   null,
        agentName:     agent.agentName || `${agent.firstName} ${agent.lastName}`,
        isAutoApprove: false,
      };
    });

    this.logger.log(
      `📝 Manual deposit | Agent: ${result.agentName} | Amount: ${dto.amount} SAR | Status: ${finalStatus} | By: ${adminEmail}`,
    );

    return {
      success: true,
      message: result.isAutoApprove
        ? 'Manual deposit created and approved successfully'
        : 'Manual deposit created as pending',
      deposit: {
        id:         result.deposit.id,
        reference:  result.deposit.reference,
        amount:     Number(result.deposit.amount),
        currency:   result.deposit.currency,
        method:     result.deposit.method,
        status:     result.deposit.status,
        createdAt:  result.deposit.createdAt,
        approvedAt: result.deposit.approvedAt || null,
      },
      ...(result.isAutoApprove && result.application && {
        summary: {
          depositAmount: result.application.amount,
          creditRepaid:  result.application.appliedToCredit,
          balanceAdded:  result.application.addedToWallet,
          newBalance:    result.application.newBalance,
          newUsedLimit:  result.application.newUsedLimit,
        },
      }),
    };
  }

  // ──────────────────────────────────
  // UPLOAD ATTACHMENT  ← ✅ এটা আগে ছিল না
  // ──────────────────────────────────
  async uploadAttachment(depositId: string, filePath: string) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      throw new NotFoundException('Deposit not found');
    }

    const updated = await this.prisma.deposit.update({
      where: { id: depositId },
      data:  { attachment: filePath },
    });

    this.logger.log(`📎 Attachment uploaded | Deposit: ${depositId}`);

    return {
      success:    true,
      message:    'Attachment uploaded successfully',
      depositId,
      attachment: updated.attachment,
    };
  }

  // ──────────────────────────────────
  // FORMAT HELPER
  // ──────────────────────────────────
  private formatDeposit(d: any) {
    return {
      id:            d.id,
      requestId:     d.reference    || d.id,
      agentId:       d.user?.agentId   || d.userId,
      agentName:     d.user?.agentName || 'Unknown',
      agentPhone:    d.user?.phone     || '',
      agentEmail:    d.user?.email     || '',
      amount:        Number(d.amount   || 0),
      currency:      d.currency        || 'SAR',
      method:        d.method          || 'MANUAL',
      transactionId: d.transactionId   || '',
      reference:     d.reference       || '',
      status:        d.status,
      createdAt:     d.createdAt,
      requestedAt:   d.createdAt,
      approvedAt:    d.approvedAt      || null,
      rejectedAt:    d.rejectedAt      || null,
      approvedBy:    d.approvedBy      || null,
      rejectionNote: d.rejectionNote   || null,
      notes:         d.notes           || null,
      attachment:    d.attachment      || null,
      attachmentUrl: d.attachment      || null,
    };
  }
} // ← class এর শেষ brace