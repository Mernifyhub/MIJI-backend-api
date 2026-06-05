import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscountApplyOn,
  RouteMatchType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDiscountRuleDto } from '../dto/create-discount-rule.dto';

@Injectable()
export class AgentDiscountService {
  private readonly logger = new Logger(AgentDiscountService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // Get discounts for logged-in agent
  // ==========================================
  async getDiscounts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tier: true,
        commission: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ safer OR builder
    const orConditions: any[] = [
      { agentId: userId }, // specific agent rule
      { agentId: null },   // global rule
    ];

    if (user.tier) {
      orConditions.push({ agentTier: user.tier });
    }

    const discounts = await this.prisma.discountRule.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: orConditions,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        agent: {
          select: {
            id: true,
            agentName: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    });

    // ✅ frontend-friendly mapping
    const mapped = discounts.map((item) => ({
      ...item,
      agentName: item.agent?.agentName || null,
      createdByName: item.createdBy
        ? `${item.createdBy.firstName || ''} ${item.createdBy.lastName || ''}`.trim()
        : null,
    }));

    return {
      success: true,
      tier: user.tier,
      commission: Number(user.commission || 0),
      totalDiscounts: discounts.length,
      data: mapped,
    };
  }

  // ==========================================
  // Get all discount rules
  // ==========================================
  async getDiscountRules(showDeleted = false) {
    const rules = await this.prisma.discountRule.findMany({
      where: showDeleted ? {} : { deletedAt: null },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        agent: {
          select: {
            id: true,
            agentName: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    });

    const mapped = rules.map((item) => ({
      ...item,
      agentName: item.agent?.agentName || null,
      createdByName: item.createdBy
        ? `${item.createdBy.firstName || ''} ${item.createdBy.lastName || ''}`.trim()
        : null,
    }));

    return {
      success: true,
      data: mapped,
    };
  }

  // ==========================================
  // Create discount rule
  // ==========================================
  async createDiscountRule(
    dto: CreateDiscountRuleDto,
    currentUserId?: string,
  ) {
    const rule = await this.prisma.discountRule.create({
      data: {
        type: dto.type,
        name: dto.name,
        description: dto.description ?? null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        discountOn: dto.discountOn ?? DiscountApplyOn.TOTAL,
        maxDiscount: dto.maxDiscount ?? null,
        minFare: dto.minFare ?? null,
        airlineCode: dto.airlineCode ?? null,
        origin: dto.origin ?? null,
        destination: dto.destination ?? null,
        routeMatchType: dto.routeMatchType ?? RouteMatchType.EXACT,
        cabinClass: dto.cabinClass ?? null,
        agentId: dto.agentId ?? null,
        agentTier: dto.agentTier ?? null,
        promoCode: dto.promoCode ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        maxUsageTotal: dto.maxUsageTotal ?? null,
        maxUsagePerAgent: dto.maxUsagePerAgent ?? null,
        priority: dto.priority ?? 10,
        isActive: dto.isActive ?? true,
        isStackable: dto.isStackable ?? false,
        currency: dto.currency ?? 'SAR',
        createdById: dto.createdById ?? currentUserId ?? null,
      },

      // ✅ IMPORTANT: create response-এও agent include করা হচ্ছে
      include: {
        agent: {
          select: {
            id: true,
            agentName: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    });

    this.logger.log(`Discount rule created: ${rule.name}`);

    return {
      success: true,
      data: {
        ...rule,
        agentName: rule.agent?.agentName || null,
        createdByName: rule.createdBy
          ? `${rule.createdBy.firstName || ''} ${rule.createdBy.lastName || ''}`.trim()
          : null,
      },
    };
  }
}