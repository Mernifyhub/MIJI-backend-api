import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  DiscountContext,
  DiscountResult,
  NormalizedFlight,
} from '../../types/flight.types';

const EMPTY_RESULT: DiscountResult = {
  discounts: [],
  totalDiscount: 0,
  hasPromo: false,
  labels: [],
};

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(private readonly prisma: PrismaService) {}

  private n(val: any): string {
    return String(val ?? '').trim();
  }

  private nUp(val: any): string {
    return this.n(val).toUpperCase();
  }

  // ── Fetch active rules ──
  private async fetchActiveRules() {
    const now = new Date();

    const rules = await this.prisma.discountRule.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return rules.filter((rule) => {
      const fromOk = !rule.validFrom || new Date(rule.validFrom) <= now;
      const toOk = !rule.validTo || new Date(rule.validTo) >= now;
      return fromOk && toOk;
    });
  }

  // ── Route matching ──
  private matchesRoute(
    rule: any,
    origin?: string,
    destination?: string,
  ): boolean {
    if (!rule.origin || !rule.destination || !origin || !destination)
      return false;

    const rO = this.nUp(rule.origin);
    const rD = this.nUp(rule.destination);
    const cO = this.nUp(origin);
    const cD = this.nUp(destination);

    if (this.nUp(rule.routeMatchType) === 'BIDIRECTIONAL') {
      return (rO === cO && rD === cD) || (rO === cD && rD === cO);
    }

    return rO === cO && rD === cD;
  }

  // ── Agent matching ──
  private matchesAgent(rule: any, ctx: DiscountContext): boolean {
    const hasAgentId = !!this.n(rule.agentId);
    const hasAgentTier = !!this.n(rule.agentTier);

    if (!hasAgentId && !hasAgentTier) return false;

    if (hasAgentId) {
      if (!ctx.agentId || this.n(rule.agentId) !== this.n(ctx.agentId))
        return false;
    }

    if (hasAgentTier) {
      if (
        !ctx.agentTier ||
        this.nUp(rule.agentTier) !== this.nUp(ctx.agentTier)
      )
        return false;
    }

    return true;
  }

  // ── Rule matching ──
  private matchesRule(rule: any, ctx: DiscountContext): boolean {
    if (rule.minFare && ctx.fareAmount < Number(rule.minFare)) return false;
    if (
      rule.maxUsageTotal &&
      rule.currentUsage >= Number(rule.maxUsageTotal)
    )
      return false;

    if (rule.cabinClass) {
      if (
        !ctx.cabinClass ||
        this.nUp(rule.cabinClass) !== this.nUp(ctx.cabinClass)
      )
        return false;
    }

    if (rule.type === 'PROMO') {
      if (!rule.promoCode || !ctx.promoCode) return false;
      if (this.nUp(rule.promoCode) !== this.nUp(ctx.promoCode)) return false;
    }

    switch (rule.type) {
      case 'GLOBAL':
        return true;

      case 'AIRLINE':
        return !!(
          rule.airlineCode &&
          ctx.airlineCode &&
          this.nUp(rule.airlineCode) === this.nUp(ctx.airlineCode)
        );

      case 'ROUTE':
        return this.matchesRoute(rule, ctx.origin, ctx.destination);

      case 'AGENT':
        return this.matchesAgent(rule, ctx);

      case 'AIRLINE_AGENT':
        return (
          !!(
            rule.airlineCode &&
            ctx.airlineCode &&
            this.nUp(rule.airlineCode) === this.nUp(ctx.airlineCode)
          ) && this.matchesAgent(rule, ctx)
        );

      case 'ROUTE_AGENT':
        return (
          this.matchesRoute(rule, ctx.origin, ctx.destination) &&
          this.matchesAgent(rule, ctx)
        );

      case 'PROMO':
        return true;

      case 'CAMPAIGN':
        return true;

      default:
        return false;
    }
  }

  // ── Calculate discount amount ──
  private calculateAmount(rule: any, ctx: DiscountContext): number {
    const applyOn =
      rule.discountOn === 'BASE_FARE' ? ctx.baseFare : ctx.fareAmount;

    let amount = 0;

    if (rule.discountType === 'FLAT') {
      amount = Number(rule.discountValue);
    } else if (rule.discountType === 'PERCENT') {
      amount = (applyOn * Number(rule.discountValue)) / 100;
      if (rule.maxDiscount && amount > Number(rule.maxDiscount)) {
        amount = Number(rule.maxDiscount);
      }
    }

    return Math.round(Math.max(0, amount) * 100) / 100;
  }

  // ── Build context from flight ──
  buildContext(
    flight: NormalizedFlight,
    agent: { agentId: string | null; agentTier: string | null },
    promoCode?: string,
  ): DiscountContext {
    const segments = flight.itineraries?.[0]?.segments ?? [];
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    return {
      airlineCode: firstSeg?.carrierCode || '',
      origin: firstSeg?.departure?.iataCode || '',
      destination: lastSeg?.arrival?.iataCode || '',
      cabinClass: firstSeg?.cabinName?.toLowerCase() || 'economy',
      agentId: agent.agentId || undefined,
      agentTier: agent.agentTier || undefined,
      promoCode: promoCode || undefined,
      fareAmount: Number(
        flight.priceBreakdown?.agentUi?.grandTotal ||
          flight.price?.grandTotal ||
          0,
      ),
      baseFare: Number(
        flight.priceBreakdown?.agentUi?.baseFare ||
          flight.price?.base ||
          0,
      ),
      currency:
        flight.priceBreakdown?.currency ||
        flight.price?.currency ||
        'SAR',
    };
  }

  // ── Main: Resolve discounts ──
  async resolveDiscounts(ctx: DiscountContext): Promise<DiscountResult> {
    try {
      const rules = await this.fetchActiveRules();
      const matched = rules.filter((rule) => this.matchesRule(rule, ctx));

      this.logger.log(
        `Matched ${matched.length}/${rules.length} rules | agent: ${ctx.agentId || 'none'} | tier: ${ctx.agentTier || 'none'}`,
      );

      if (matched.length === 0) return EMPTY_RESULT;

      const typeWeight: Record<string, number> = {
        ROUTE_AGENT: 70,
        AIRLINE_AGENT: 60,
        PROMO: 55,
        ROUTE: 50,
        AIRLINE: 40,
        AGENT: 30,
        CAMPAIGN: 20,
        GLOBAL: 10,
      };

      matched.sort((a, b) => {
        const wA = typeWeight[a.type] ?? 0;
        const wB = typeWeight[b.type] ?? 0;
        if (wB !== wA) return wB - wA;
        return (b.priority ?? 0) - (a.priority ?? 0);
      });

      const applied: any[] = [];
      let totalDiscount = 0;
      let hasPromo = false;
      const labels: string[] = [];

      const best = matched[0];
      const bestAmount = this.calculateAmount(best, ctx);

      if (bestAmount > 0) {
        applied.push({
          ruleId: best.id,
          ruleName: best.name,
          ruleType: best.type,
          discountType: best.discountType,
          discountValue: best.discountValue,
          discountOn: best.discountOn,
          calculatedAmount: bestAmount,
          promoCode: best.promoCode,
          isStackable: best.isStackable,
        });
        totalDiscount += bestAmount;
        if (best.promoCode) hasPromo = true;
        labels.push(
          best.promoCode ? `Promo: ${best.promoCode}` : best.name,
        );
      }

      const stackables = matched.filter(
        (r) => r.isStackable && r.id !== best.id,
      );

      for (const rule of stackables) {
        const amount = this.calculateAmount(rule, ctx);
        if (amount <= 0) continue;

        applied.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.type,
          discountType: rule.discountType,
          discountValue: rule.discountValue,
          discountOn: rule.discountOn,
          calculatedAmount: amount,
          promoCode: rule.promoCode,
          isStackable: true,
        });

        totalDiscount += amount;
        if (rule.promoCode) hasPromo = true;
        labels.push(
          rule.promoCode ? `Promo: ${rule.promoCode}` : rule.name,
        );
      }

      // Safety cap: max 25% of fare
      totalDiscount = Math.min(totalDiscount, ctx.fareAmount * 0.25);

      return {
        discounts: applied,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        hasPromo,
        labels,
      };
    } catch (error) {
      this.logger.error('resolveDiscounts error:', error);
      return EMPTY_RESULT;
    }
  }

  // ── Record usage ──
  async recordUsage(params: {
    discountRuleId: string;
    bookingId: string;
    agentId?: string | null;
    amount: number;
    currency?: string;
    promoCode?: string | null;
    discountType?: string;
    discountValue?: number;
    note?: string;
  }) {
    try {
      await this.prisma.$transaction([
        this.prisma.discountUsageLog.create({
          data: {
            discountRuleId: params.discountRuleId,
            bookingId: params.bookingId,
            agentId: params.agentId || null,
            amount: params.amount,
            currency: params.currency || 'SAR',
            promoCode: params.promoCode || null,
            // ✅ Schema required fields
            discountType: (params.discountType || 'FLAT') as any,
            discountValue: params.discountValue ?? 0,
            note: params.note || null,
          },
        }),
        this.prisma.discountRule.update({
          where: { id: params.discountRuleId },
          data: { currentUsage: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      this.logger.error('recordUsage error:', error);
    }
  }

  // ── Check per-agent usage limit ──
  async checkAgentUsageLimit(
    ruleId: string,
    agentId: string,
    maxPerAgent: number,
  ): Promise<boolean> {
    const count = await this.prisma.discountUsageLog.count({
      where: {
        discountRuleId: ruleId,
        agentId,
      },
    });

    return count < maxPerAgent;
  }
}