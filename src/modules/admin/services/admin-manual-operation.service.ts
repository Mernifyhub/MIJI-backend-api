import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetOperationsDto } from 'src/modules/admin/dto/manual-operation/get-operations.dto';
import { CreateOperationDto,ALL_TYPES } from 'src/modules/admin/dto/manual-operation/create-operation.dto';

// ── Operation type constants ──
const CREDIT_TYPES = [
  'refund',
  'acm',
  'amount_add',
  'bonus',
  'add_credit',
  'adjustment',
];

const DEBIT_TYPES = [
  'adm',
  'manual_booking',
  'amount_deduct',
  'date_change',
  'penalty',
];

const LIMIT_TYPES = ['add_credit', 'limit_add'];

// ── Agent status that blocks operations ──
const BLOCKED_STATUSES = ['INACTIVE', 'SUSPENDED'];

const isCredit = (type: string) => CREDIT_TYPES.includes(type);
const isDebit = (type: string) => DEBIT_TYPES.includes(type);
const isLimit = (type: string) => LIMIT_TYPES.includes(type);

@Injectable()
export class AdminManualOperationService {
  private readonly logger = new Logger(AdminManualOperationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────
  // HELPER: Find Agent by UUID or agentId field
  // ─────────────────────────────────────────────────────────
  private async findAgent(agentId: string) {
    this.logger.debug(`Looking up agent with identifier: "${agentId}"`);

    if (!agentId || !agentId.trim()) {
      throw new BadRequestException('Agent ID is required and cannot be empty');
    }

    const agent = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: agentId.trim() },
          { agentId: agentId.trim() },
        ],
      },
      select: {
        id: true,
        agentId: true,
        agentName: true,
        firstName: true,
        lastName: true,
        email: true,
        balance: true,
        creditLimit: true,
        usedLimit: true,
        status: true,
      },
    });

    if (!agent) {
      this.logger.error(
        `Agent not found for identifier: "${agentId}". ` +
        `Make sure you are passing either the User UUID or the Agent ID field.`
      );
      throw new NotFoundException(
        `Agent not found for id: "${agentId}". ` +
        `Please check the Agent ID and try again.`
      );
    }

    this.logger.debug(
      `Agent found: ${agent.agentName || agent.email} ` +
      `(UUID: ${agent.id}) | Status: ${agent.status}`
    );

    // ── Block operations for INACTIVE or SUSPENDED agents ──
    if (BLOCKED_STATUSES.includes(agent.status)) {
      throw new BadRequestException(
        `Agent account is "${agent.status}". ` +
        `Cannot perform operations on inactive or suspended accounts.`
      );
    }

    // ── Warn for PENDING agents but still allow admin operations ──
    if (agent.status === 'PENDING') {
      this.logger.warn(
        `Agent "${agent.agentName || agent.email}" is in PENDING status. ` +
        `Admin operation is being performed anyway.`
      );
    }

    return agent;
  }

  // ─────────────────────────────────────────────────────────
  // HELPER: Format Operation for Response
  // ─────────────────────────────────────────────────────────
  private formatOperation(op: any) {
    return {
      id: op.id,
      type: op.type,
      amount: Number(op.amount || 0),
      status: op.status,
      description: op.description,
      reference: op.reference,
      pnr: op.pnr,
      passengerName: op.passengerName,
      route: op.route,
      travelDate: op.travelDate,
      newLimit: op.newLimit ? Number(op.newLimit) : null,
      previousLimit: op.previousLimit ? Number(op.previousLimit) : null,
      createdBy: op.createdBy,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
      agentId: op.user?.agentId || op.user?.id || null,
      agentUUID: op.user?.id || null,
      agentName:
        op.user?.agentName ||
        `${op.user?.firstName || ''} ${op.user?.lastName || ''}`.trim() ||
        op.user?.email ||
        'Unknown',
      agentEmail: op.user?.email || null,
      agentStatus: op.user?.status || null,
      currentBalance: Number(op.user?.balance || 0),
      currentCreditLimit: Number(op.user?.creditLimit || 0),
      currentUsedLimit: Number(op.user?.usedLimit || 0),
      isCredit: isCredit(op.type),
      isDebit: isDebit(op.type),
      isLimitOp: isLimit(op.type),
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET ALL OPERATIONS
  // ─────────────────────────────────────────────────────────
  async getOperations(query: GetOperationsDto) {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(100, query?.limit || 20);
    const skip = (page - 1) * limit;

    // ── Build Where Clause ──
    const where: any = {};

    if (query?.type) where.type = query.type;
    if (query?.status) where.status = query.status;
    if (query?.userId) where.userId = query.userId;

    // ── Filter by agentId (UUID or agentId field) ──
    if (query?.agentId && !query?.userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: query.agentId },
            { agentId: query.agentId },
          ],
        },
        select: { id: true },
      });
      if (user) {
        where.userId = user.id;
      } else {
        // Return empty if agent not found instead of crashing
        return {
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
          stats: {
            todayOperations: 0,
            totalCredit: 0,
            totalDebit: 0,
            pendingCount: 0,
          },
        };
      }
    }

    // ── Search by reference, description, pnr, agent ──
    if (query?.search) {
      const searchTerm = query.search.trim();
      where.OR = [
        { reference: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { pnr: { contains: searchTerm, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { agentName: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { agentId: { contains: searchTerm, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    // ── Fetch Operations + Count ──
    const [operations, total] = await Promise.all([
      this.prisma.manualOperation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              agentId: true,
              agentName: true,
              firstName: true,
              lastName: true,
              email: true,
              balance: true,
              creditLimit: true,
              usedLimit: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.manualOperation.count({ where }),
    ]);

    // ── Stats ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayCount, creditAgg, debitAgg, pendingCount] = await Promise.all([
      this.prisma.manualOperation.count({
        where: { createdAt: { gte: today } },
      }),
      this.prisma.manualOperation.aggregate({
        where: {
          type: { in: CREDIT_TYPES },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),
      this.prisma.manualOperation.aggregate({
        where: {
          type: { in: DEBIT_TYPES },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),
      this.prisma.manualOperation.count({
        where: { status: 'PENDING' },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: operations.map((op) => this.formatOperation(op)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      stats: {
        todayOperations: todayCount,
        totalCredit: Number(creditAgg._sum.amount || 0),
        totalDebit: Number(debitAgg._sum.amount || 0),
        pendingCount,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET SINGLE OPERATION BY ID
  // ─────────────────────────────────────────────────────────
  async getOperationById(id: string) {
    if (!id?.trim()) {
      throw new BadRequestException('Operation ID is required');
    }

    const operation = await this.prisma.manualOperation.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            agentId: true,
            agentName: true,
            firstName: true,
            lastName: true,
            email: true,
            balance: true,
            creditLimit: true,
            usedLimit: true,
            status: true,
          },
        },
      },
    });

    if (!operation) {
      throw new NotFoundException(`Operation not found for id: "${id}"`);
    }

    return {
      success: true,
      data: this.formatOperation(operation),
    };
  }

  // ─────────────────────────────────────────────────────────
  // GET AGENT SUMMARY
  // ─────────────────────────────────────────────────────────
  async getAgentSummary(agentId: string) {
    const agent = await this.findAgent(agentId);
    const resolvedAgentId = agent.id;

    const walletBalance = Math.max(0, Number(agent.balance || 0));
    const creditLimit = Number(agent.creditLimit || 0);
    const usedLimit = Number(agent.usedLimit || 0);
    const availableCredit = Math.max(0, creditLimit - usedLimit);

    const [creditAgg, debitAgg, recentOps] = await Promise.all([
      this.prisma.manualOperation.aggregate({
        where: {
          userId: resolvedAgentId,
          type: { in: CREDIT_TYPES },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.manualOperation.aggregate({
        where: {
          userId: resolvedAgentId,
          type: { in: DEBIT_TYPES },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.manualOperation.findMany({
        where: { userId: resolvedAgentId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          description: true,
          reference: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        agent: {
          id: agent.agentId || resolvedAgentId,
          uuid: resolvedAgentId,
          name:
            agent.agentName ||
            `${agent.firstName || ''} ${agent.lastName || ''}`.trim() ||
            agent.email,
          email: agent.email,
          status: agent.status,
        },
        wallet: {
          balance: walletBalance,
          creditLimit,
          usedLimit,
          availableCredit,
          totalAvailable: walletBalance + availableCredit,
        },
        operationSummary: {
          totalCredited: Number(creditAgg._sum.amount || 0),
          totalDebited: Number(debitAgg._sum.amount || 0),
          creditCount: creditAgg._count,
          debitCount: debitAgg._count,
        },
        recentOperations: recentOps.map((op) => ({
          id: op.id,
          type: op.type,
          amount: Number(op.amount || 0),
          status: op.status,
          description: op.description,
          reference: op.reference,
          createdAt: op.createdAt,
          isCredit: isCredit(op.type),
          isDebit: isDebit(op.type),
          isLimitOp: isLimit(op.type),
        })),
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // CREATE OPERATION
  // ─────────────────────────────────────────────────────────
  async createOperation(
    adminId: string,
    adminEmail: string,
    body: CreateOperationDto,
  ) {
    const {
      agentId,
      operationType: type,
      description = '',
      pnr,
      passengerName,
      route,
      travelDate,
      newLimit,
    } = body;

    const amount = Number(body.amount || 0);
    const reference = body.reference?.trim() || `MOP-${Date.now()}`;
    const createdBy = adminEmail || adminId;

    // ── Validate Operation Type ──
    if (!ALL_TYPES.includes(type as any)) {
      throw new BadRequestException(
        `Invalid operation type: "${type}". ` +
        `Valid types are: ${ALL_TYPES.join(', ')}`
      );
    }

    // ── Find Agent (handles UUID or agentId field) ──
    const agent = await this.findAgent(agentId);
    const resolvedAgentId = agent.id; // Always use UUID internally

    // ── Wallet Calculations ──
    const walletBalance = Math.max(0, Number(agent.balance || 0));
    const creditLimit = Number(agent.creditLimit || 0);
    const usedLimit = Number(agent.usedLimit || 0);
    const availableCredit = Math.max(0, creditLimit - usedLimit);
    const totalAvailable = walletBalance + availableCredit;

    const agentName =
      agent.agentName ||
      `${agent.firstName || ''} ${agent.lastName || ''}`.trim() ||
      agent.email;

    this.logger.debug(
      `[createOperation] type=${type} | amount=${amount} | agent=${agentName} | ` +
      `balance=${walletBalance} | creditLimit=${creditLimit} | ` +
      `usedLimit=${usedLimit} | availableCredit=${availableCredit} | ` +
      `totalAvailable=${totalAvailable}`
    );

    // ════════════════════════════════════════════════
    // CREDIT LIMIT OPERATION (add_credit / limit_add)
    // ════════════════════════════════════════════════
    if (isLimit(type)) {
      const targetLimit = Number(newLimit ?? amount);

      if (isNaN(targetLimit) || targetLimit < 0) {
        throw new BadRequestException(
          'New limit must be a valid number and cannot be negative'
        );
      }

      if (targetLimit < usedLimit) {
        throw new BadRequestException(
          `New limit (${targetLimit} SAR) cannot be less than ` +
          `current used limit (${usedLimit} SAR). ` +
          `Minimum allowed new limit: ${usedLimit} SAR`
        );
      }

      const result = await this.prisma.$transaction(async (tx) => {
        const operation = await tx.manualOperation.create({
          data: {
            userId: resolvedAgentId,
            createdBy,
            type,
            amount: targetLimit,
            status: 'COMPLETED',
            description:
              description.trim() ||
              `Credit limit updated: ${creditLimit} → ${targetLimit} SAR`,
            reference,
            newLimit: targetLimit,
            previousLimit: creditLimit,
          },
        });

        await tx.user.update({
          where: { id: resolvedAgentId },
          data: { creditLimit: targetLimit },
        });

        return operation;
      });

      this.logger.log(
        `✅ [LIMIT] Agent: ${agentName} | ` +
        `${creditLimit} → ${targetLimit} SAR | ` +
        `By: ${createdBy} | Ref: ${reference}`
      );

      return {
        success: true,
        message: `Credit limit successfully updated to ${targetLimit} SAR`,
        data: {
          operationId: result.id,
          agentId: agent.agentId || resolvedAgentId,
          agentUUID: resolvedAgentId,
          agentName,
          agentStatus: agent.status,
          type,
          previousLimit: creditLimit,
          newLimit: targetLimit,
          reference: result.reference,
          status: 'COMPLETED',
          createdAt: result.createdAt,
        },
      };
    }

    // ════════════════════════════════════════════════
    // CREDIT OPERATION
    // ════════════════════════════════════════════════
    if (isCredit(type)) {
      if (amount <= 0) {
        throw new BadRequestException(
          'Amount must be greater than 0 for credit operations'
        );
      }

      const result = await this.prisma.$transaction(async (tx) => {
        // ── Create Operation Record ──
        const operation = await tx.manualOperation.create({
          data: {
            userId: resolvedAgentId,
            createdBy,
            type,
            amount,
            status: 'COMPLETED',
            description:
              description.trim() || `Manual ${type} - ${amount} SAR`,
            reference,
            pnr: pnr || null,
            passengerName: passengerName || null,
            route: route || null,
            travelDate: travelDate ? new Date(travelDate) : null,
          },
        });

        // ── Balance Logic ──
        // Priority: First repay used credit, then add to wallet balance
        let creditRepaid = 0;
        let balanceAdded = 0;
        let newUsedLimit = usedLimit;
        let newBalance = walletBalance;

        if (usedLimit > 0) {
          creditRepaid = Math.min(amount, usedLimit);
          balanceAdded = amount - creditRepaid;
          newUsedLimit = Math.max(0, usedLimit - creditRepaid);
          newBalance = walletBalance + balanceAdded;
        } else {
          balanceAdded = amount;
          newBalance = walletBalance + amount;
        }

        // ── Update User Balance ──
        await tx.user.update({
          where: { id: resolvedAgentId },
          data: {
            balance: newBalance,
            usedLimit: newUsedLimit,
          },
        });

        // ── AgentLedger Entry ──
        await tx.agentLedger.create({
          data: {
            userId: resolvedAgentId,
            type: type.toUpperCase() as any,
            sourceType: 'MANUAL_OPERATION',
            sourceId: operation.id,
            operationId: operation.id,
            credit: amount,
            debit: 0,
            balanceAfter: newBalance,
            currency: 'SAR',
            description: operation.description,
            reference: operation.reference,
            pnr: pnr || null,
            status: 'COMPLETED',
            createdBy,
            invoiceNo: `MOP-${operation.id}`,
          },
        });

        return {
          operation,
          newBalance,
          newUsedLimit,
          creditRepaid,
          balanceAdded,
        };
      });

      this.logger.log(
        `✅ [CREDIT] Agent: ${agentName} | +${amount} SAR | Type: ${type} | ` +
        `CreditRepaid: ${result.creditRepaid} SAR | ` +
        `BalanceAdded: ${result.balanceAdded} SAR | ` +
        `NewBalance: ${result.newBalance} SAR | ` +
        `By: ${createdBy}`
      );

      return {
        success: true,
        message: `Manual ${type} of ${amount} SAR completed successfully`,
        data: {
          operationId: result.operation.id,
          agentId: agent.agentId || resolvedAgentId,
          agentUUID: resolvedAgentId,
          agentName,
          agentStatus: agent.status,
          type,
          amount,
          creditRepaid: result.creditRepaid,
          balanceAdded: result.balanceAdded,
          previousBalance: walletBalance,
          previousUsedLimit: usedLimit,
          currentBalance: result.newBalance,
          currentUsedLimit: result.newUsedLimit,
          reference: result.operation.reference,
          status: 'COMPLETED',
          createdAt: result.operation.createdAt,
        },
      };
    }

    // ════════════════════════════════════════════════
    // DEBIT OPERATION
    // ════════════════════════════════════════════════
    if (amount <= 0) {
      throw new BadRequestException(
        'Amount must be greater than 0 for debit operations'
      );
    }

    if (totalAvailable < amount) {
      throw new BadRequestException(
        `Insufficient funds for agent "${agentName}". ` +
        `Wallet Balance: ${walletBalance.toFixed(2)} SAR + ` +
        `Available Credit: ${availableCredit.toFixed(2)} SAR = ` +
        `Total Available: ${totalAvailable.toFixed(2)} SAR. ` +
        `Required: ${amount.toFixed(2)} SAR`
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // ── Create Operation Record ──
      const operation = await tx.manualOperation.create({
        data: {
          userId: resolvedAgentId,
          createdBy,
          type,
          amount,
          status: 'COMPLETED',
          description:
            description.trim() || `Manual ${type} - ${amount} SAR`,
          reference,
          pnr: pnr || null,
          passengerName: passengerName || null,
          route: route || null,
          travelDate: travelDate ? new Date(travelDate) : null,
        },
      });

      // ── Balance Logic ──
      // Priority: First deduct from wallet, then use credit limit
      const fromWallet = Math.min(walletBalance, amount);
      const fromCredit = Math.max(0, amount - fromWallet);
      const newBalance = Math.max(0, walletBalance - fromWallet);
      const newUsedLimit = usedLimit + fromCredit;

      // ── Update User Balance ──
      await tx.user.update({
        where: { id: resolvedAgentId },
        data: {
          balance: newBalance,
          usedLimit: newUsedLimit,
        },
      });

      // ── AgentLedger Entry ──
      await tx.agentLedger.create({
        data: {
          userId: resolvedAgentId,
          type: type.toUpperCase() as any,
          sourceType: 'MANUAL_OPERATION',
          sourceId: operation.id,
          operationId: operation.id,
          debit: amount,
          credit: 0,
          balanceAfter: newBalance,
          currency: 'SAR',
          description: operation.description,
          reference: operation.reference,
          pnr: pnr || null,
          status: 'COMPLETED',
          createdBy,
          invoiceNo: `MOP-${operation.id}`,
        },
      });

      return {
        operation,
        newBalance,
        newUsedLimit,
        fromWallet,
        fromCredit,
      };
    });

    this.logger.log(
      `✅ [DEBIT] Agent: ${agentName} | -${amount} SAR | Type: ${type} | ` +
      `FromWallet: ${result.fromWallet} SAR | ` +
      `FromCredit: ${result.fromCredit} SAR | ` +
      `NewBalance: ${result.newBalance} SAR | ` +
      `By: ${createdBy}`
    );

    return {
      success: true,
      message: `Manual ${type} of ${amount} SAR completed successfully`,
      data: {
        operationId: result.operation.id,
        agentId: agent.agentId || resolvedAgentId,
        agentUUID: resolvedAgentId,
        agentName,
        agentStatus: agent.status,
        type,
        amount,
        fromWallet: result.fromWallet,
        fromCredit: result.fromCredit,
        previousBalance: walletBalance,
        previousUsedLimit: usedLimit,
        currentBalance: result.newBalance,
        currentUsedLimit: result.newUsedLimit,
        reference: result.operation.reference,
        status: 'COMPLETED',
        createdAt: result.operation.createdAt,
      },
    };
  }
}