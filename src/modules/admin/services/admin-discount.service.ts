import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentTier } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDiscountRuleDto } from '../dto/create-discount-rule.dto';

@Injectable()
export class AdminDiscountService {
  private readonly logger = new Logger(AdminDiscountService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── helpers ──

  private get discountInclude() {
    return {
      agent: {
        select: { id: true, agentName: true, email: true, firstName: true, lastName: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      _count: { select: { usageLogs: true } },
    };
  }

  private mapRule(r: any) {
    return {
      ...r,
      agentName: r?.agent?.agentName || `${r?.agent?.firstName || ''} ${r?.agent?.lastName || ''}`.trim() || null,
      createdByName: r?.createdBy ? `${r.createdBy.firstName || ''} ${r.createdBy.lastName || ''}`.trim() : null,
      currentUsage: r?._count?.usageLogs || 0,
    };
  }

  private clean(v: any): string | null {
    if (!v) return null;
    const s = String(v).trim();
    return s === '' || s === 'null' || s === 'undefined' ? null : s;
  }

  private parseTier(v: any): AgentTier | null {
    const t = String(v || '').trim().toUpperCase();
    if (!t) return null;
    return (Object.values(AgentTier) as string[]).includes(t) ? (t as AgentTier) : null;
  }

  private buildData(dto: any) {
    const type = dto.type;
    const needsAgent = ['AGENT', 'AIRLINE_AGENT', 'ROUTE_AGENT'].includes(type);

    return {
      type: type as any,
      name: dto.name,
      description: dto.description || null,
      discountType: dto.discountType as any,
      discountValue: Number(dto.discountValue || 0),
      discountOn: (dto.discountOn || 'TOTAL') as any,
      maxDiscount: dto.maxDiscount ? Number(dto.maxDiscount) : null,
      minFare: dto.minFare ? Number(dto.minFare) : null,
      airlineCode: dto.airlineCode || null,
      origin: dto.origin || null,
      destination: dto.destination || null,
      routeMatchType: (dto.routeMatchType || 'EXACT') as any,
      cabinClass: dto.cabinClass || null,
      agentId: needsAgent ? this.clean(dto.agentId) : null,
      agentTier: this.parseTier(dto.agentTier),
      promoCode: dto.promoCode || null,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      maxUsageTotal: dto.maxUsageTotal ? Number(dto.maxUsageTotal) : null,
      maxUsagePerAgent: dto.maxUsagePerAgent ? Number(dto.maxUsagePerAgent) : null,
      priority: Number(dto.priority || 10),
      isActive: dto.isActive ?? true,
      isStackable: dto.isStackable ?? false,
      currency: dto.currency || 'SAR',
    };
  }

  // ── GET ──

  async getDiscountRules(options: { showDeleted?: boolean; type?: string; search?: string } = {}) {
    const where: any = options.showDeleted ? {} : { deletedAt: null };
    if (options.type) where.type = options.type;
    if (options.search?.trim()) {
      const q = options.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { promoCode: { contains: q, mode: 'insensitive' } },
        { airlineCode: { contains: q.toUpperCase(), mode: 'insensitive' } },
        { origin: { contains: q.toUpperCase(), mode: 'insensitive' } },
        { destination: { contains: q.toUpperCase(), mode: 'insensitive' } },
      ];
    }

    const rules = await this.prisma.discountRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: this.discountInclude,
    });

    return { success: true, data: rules.map((r) => this.mapRule(r)) };
  }

  // ── GET AGENTS ──

  async getAgents(limit = 500) {
    const agents = await this.prisma.user.findMany({
      take: Math.max(1, limit),
      orderBy: { createdAt: 'desc' },
      select: { id: true, agentName: true, firstName: true, lastName: true, email: true, tier: true },
    });
    return { success: true, data: agents };
  }

  // ── POST ──

  async createDiscountRule(dto: CreateDiscountRuleDto) {
    try {
      const rule = await this.prisma.discountRule.create({
        data: {
          ...this.buildData(dto),
          createdById: this.clean(dto.createdById),
        },
        include: this.discountInclude,
      });

      this.logger.log(`Created: ${rule.name}`);
      return { success: true, data: this.mapRule(rule) };
    } catch (err: any) {
      this.logger.error(`Create failed: ${err.message}`);
      throw err;
    }
  }

  // ── PUT ──

  async updateDiscountRule(id: string, dto: any) {
    const existing = await this.prisma.discountRule.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Not found');

    try {
      const updated = await this.prisma.discountRule.update({
        where: { id },
        data: {
          ...this.buildData(dto),
          updatedById: this.clean(dto.updatedById),
        },
        include: this.discountInclude,
      });

      this.logger.log(`Updated: ${updated.name}`);
      return { success: true, data: this.mapRule(updated) };
    } catch (err: any) {
      this.logger.error(`Update failed: ${err.message}`);
      throw err;
    }
  }

  // ── DELETE ──

  async deleteDiscountRule(id: string) {
    const existing = await this.prisma.discountRule.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Not found');

    await this.prisma.discountRule.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { success: true, message: 'Deleted' };
  }
}