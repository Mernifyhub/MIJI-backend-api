// src/modules/flights/services/processors/markup.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CurrencyService } from './currency.service';
import type {
  MarkupRule,
  MarkupContext,
  NormalizedFlight,
} from '../../types/flight.types';

@Injectable()
export class MarkupService {
  private readonly logger = new Logger(MarkupService.name);
  private readonly DISPLAY_CURRENCY = 'SAR';

  // ✅ IMPORTANT: Exchange rates to SAR
  // Update these rates regularly or fetch from external API
  private readonly exchangeRatesToSAR: Record<string, number> = {
    SAR: 1,
    USD: 3.75,
    EUR: 4.05,
    GBP: 4.75,
    AED: 1.02,
    BDT: 0.031,
    INR: 0.045,
    PKR: 0.0135,
    RUB: 0.041, // ✅ Travelpayouts fix: 1 RUB = ~0.041 SAR (UPDATE THIS)
    CAD: 2.75,
    AUD: 2.48,
    SGD: 2.78,
    CHF: 4.15,
    JPY: 0.025,
    CNY: 0.52,
    THB: 0.11,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  // ==========================================
  // Helpers
  // ==========================================
  private round2(value: number): number {
    return Math.round((value || 0) * 100) / 100;
  }

  private normalize(value?: string | null): string {
    return (value || '').trim().toUpperCase();
  }

  private toNum(value: any): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  // ✅ NEW: Convert any amount to SAR using our rate map
  private convertAmountToSAR(amount: number, fromCurrency: string): number {
    const currency = String(fromCurrency || 'SAR').toUpperCase();

    // Already SAR
    if (currency === 'SAR') return this.round2(amount);

    // Check our map
    const rate = this.exchangeRatesToSAR[currency];
    if (rate) {
      return this.round2(amount * rate);
    }

    // Fallback: try currencyService if available
    try {
      const converted = this.currencyService.convertCurrency(
        amount,
        currency,
        this.DISPLAY_CURRENCY,
      );
      this.logger.log(`Rate for ${currency} not in map, used CurrencyService`);
      return this.round2(converted);
    } catch {
      this.logger.error(
        `No exchange rate for currency: ${currency}. Returning amount unchanged.`,
      );
      return this.round2(amount);
    }
  }

  // ==========================================
  // Fetch Markup Rules from DB
  // ==========================================
  async fetchRules(agentId: string | null): Promise<MarkupRule[]> {
    const now = new Date();

    const rows = await this.prisma.markup.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ agentId: null }, ...(agentId ? [{ agentId }] : [])],
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return rows.map((r) => ({
      ...r,
      markupAmount: Number(r.markupAmount ?? 0),
      markupPercent: Number(r.markupPercent ?? 0),
      markupCurrency: r.markupCurrency || 'SAR',
    })) as MarkupRule[];
  }

  // ==========================================
  // Convert Flight Prices to SAR
  // ==========================================
  convertFlightToSAR(flight: NormalizedFlight): NormalizedFlight {
    const sourceCurrency = String(
      flight?.priceBreakdown?.currency ||
        flight?.price?.currency ||
        'USD',
    ).toUpperCase();

    // ✅ Already SAR হলে শুধু audit add করো
    if (sourceCurrency === this.DISPLAY_CURRENCY) {
      return {
        ...flight,
        _currencyConversion: {
          originalCurrency: sourceCurrency,
          displayCurrency: this.DISPLAY_CURRENCY,
          exchangeRate: 1,
          converted: false,
        },
      } as NormalizedFlight;
    }

    // ✅ Deep clone
    const updated: NormalizedFlight = JSON.parse(
      JSON.stringify(flight),
    );

    // ✅ Get rate for audit info
    const exchangeRate = this.exchangeRatesToSAR[sourceCurrency] || null;

    // =========================
    // Convert PRICE object
    // =========================
    if (updated.price) {
      updated.price.base = String(
        this.convertAmountToSAR(
          Number(updated.price.base || 0),
          sourceCurrency,
        ),
      );

      updated.price.tax = String(
        this.convertAmountToSAR(
          Number(updated.price.tax || 0),
          sourceCurrency,
        ),
      );

      updated.price.total = String(
        this.convertAmountToSAR(
          Number(updated.price.total || 0),
          sourceCurrency,
        ),
      );

      updated.price.grandTotal = String(
        this.convertAmountToSAR(
          Number(updated.price.grandTotal || 0),
          sourceCurrency,
        ),
      );

      updated.price.markup = String(
        this.convertAmountToSAR(
          Number(updated.price.markup || 0),
          sourceCurrency,
        ),
      );

      updated.price.ait = String(
        this.convertAmountToSAR(
          Number(updated.price.ait || 0),
          sourceCurrency,
        ),
      );

      updated.price.currency = this.DISPLAY_CURRENCY;
    }

    // =========================
    // Convert AGENT UI section
    // =========================
    const ui = updated.priceBreakdown?.agentUi;
    if (ui) {
      ui.baseFare = this.convertAmountToSAR(
        Number(ui.baseFare || 0),
        sourceCurrency,
      );

      ui.taxAmount = this.convertAmountToSAR(
        Number(ui.taxAmount || 0),
        sourceCurrency,
      );

      ui.totalBaseTax = this.convertAmountToSAR(
        Number(ui.totalBaseTax || 0),
        sourceCurrency,
      );

      ui.customerInvoiceTotal = this.convertAmountToSAR(
        Number(ui.customerInvoiceTotal || 0),
        sourceCurrency,
      );

      ui.discountOrCommission = this.convertAmountToSAR(
        Number(ui.discountOrCommission || 0),
        sourceCurrency,
      );

      ui.grandTotal = this.convertAmountToSAR(
        Number(ui.grandTotal || 0),
        sourceCurrency,
      );

      const totalPax = Math.max(
        1,
        (ui.adults || 1) + (ui.children || 0) + (ui.infants || 0),
      );

      ui.perPerson = this.round2(ui.grandTotal / totalPax);
      ui.currency = this.DISPLAY_CURRENCY;
    }

    // =========================
    // Convert ADMIN section
    // =========================
    const admin = updated.priceBreakdown?.admin;
    if (admin) {
      admin.supplierFare = this.convertAmountToSAR(
        Number(admin.supplierFare || 0),
        sourceCurrency,
      );

      admin.publishedFare = this.convertAmountToSAR(
        Number(admin.publishedFare || 0),
        sourceCurrency,
      );

      admin.offeredFare = this.convertAmountToSAR(
        Number(admin.offeredFare || 0),
        sourceCurrency,
      );

      admin.markup = this.convertAmountToSAR(
        Number(admin.markup || 0),
        sourceCurrency,
      );

      admin.serviceFee = this.convertAmountToSAR(
        Number(admin.serviceFee || 0),
        sourceCurrency,
      );

      admin.convenienceFee = this.convertAmountToSAR(
        Number(admin.convenienceFee || 0),
        sourceCurrency,
      );

      admin.transactionFee = this.convertAmountToSAR(
        Number(admin.transactionFee || 0),
        sourceCurrency,
      );

      admin.agentDiscount = this.convertAmountToSAR(
        Number(admin.agentDiscount || 0),
        sourceCurrency,
      );

      admin.promoDiscount = this.convertAmountToSAR(
        Number(admin.promoDiscount || 0),
        sourceCurrency,
      );

      admin.commission = this.convertAmountToSAR(
        Number(admin.commission || 0),
        sourceCurrency,
      );

      admin.ait = this.convertAmountToSAR(
        Number(admin.ait || 0),
        sourceCurrency,
      );

      admin.vat = this.convertAmountToSAR(
        Number(admin.vat || 0),
        sourceCurrency,
      );

      admin.roundOff = this.convertAmountToSAR(
        Number(admin.roundOff || 0),
        sourceCurrency,
      );

      admin.paymentGatewayFee = this.convertAmountToSAR(
        Number(admin.paymentGatewayFee || 0),
        sourceCurrency,
      );

      admin.netPayableToSupplier = this.convertAmountToSAR(
        Number(admin.netPayableToSupplier || 0),
        sourceCurrency,
      );

      admin.netReceivableFromAgent = this.convertAmountToSAR(
        Number(admin.netReceivableFromAgent || 0),
        sourceCurrency,
      );

      admin.grossProfit = this.convertAmountToSAR(
        Number(admin.grossProfit || 0),
        sourceCurrency,
      );

      admin.netProfit = this.convertAmountToSAR(
        Number(admin.netProfit || 0),
        sourceCurrency,
      );
      // marginPercent unchanged (it's a %)
    }

    // =========================
    // Root priceBreakdown currency
    // =========================
    if (updated.priceBreakdown) {
      updated.priceBreakdown.currency = this.DISPLAY_CURRENCY;
    }

    // =========================
    // Audit info
    // =========================
    (updated as any)._currencyConversion = {
      originalCurrency: sourceCurrency,
      displayCurrency: this.DISPLAY_CURRENCY,
      exchangeRate,
      converted: true,
    };

    this.logger.log(
      `Currency converted to SAR | flightId=${flight?.id} | from=${sourceCurrency} | rate=${exchangeRate} | grandTotal=${flight?.price?.grandTotal} -> ${updated?.price?.grandTotal}`,
    );

    return updated;
  }

  // ==========================================
  // Apply Markup to Flight
  // ==========================================
  applyMarkupToFlight(
    flight: NormalizedFlight,
    rules: MarkupRule[],
    context: MarkupContext,
  ): NormalizedFlight {
    const ui = flight.priceBreakdown?.agentUi;
    if (!ui) return flight;

    const baseFare = Number(ui.baseFare || 0);
    const taxAmount = Number(ui.taxAmount || 0);

    const applicable = this.findApplicableRules(rules, context);
    const rule = this.findBestRule(applicable);

    if (!rule) return flight;

    const fareBase =
      rule.markupOn === 'TOTAL'
        ? baseFare + taxAmount
        : baseFare;

    const fixedPart = this.round2(this.toNum(rule.markupAmount));
    const percentPart = this.round2(
      (fareBase * this.toNum(rule.markupPercent)) / 100,
    );
    const markupValue = this.round2(fixedPart + percentPart);

    if (markupValue <= 0) return flight;

    const updated: NormalizedFlight = JSON.parse(
      JSON.stringify(flight),
    );
    const updatedUi = updated.priceBreakdown!.agentUi;

    if (rule.markupOn === 'BASE_FARE') {
      updatedUi.baseFare = this.round2(baseFare + markupValue);
    } else {
      updatedUi.taxAmount = this.round2(taxAmount + markupValue);
    }

    updatedUi.totalBaseTax = this.round2(
      updatedUi.baseFare + updatedUi.taxAmount,
    );
    updatedUi.customerInvoiceTotal = updatedUi.totalBaseTax;

    const discount = Number(updatedUi.discountOrCommission || 0);
    updatedUi.grandTotal = this.round2(
      Math.max(0, updatedUi.customerInvoiceTotal - discount),
    );

    const totalPax = Math.max(
      1,
      (updatedUi.adults || 1) +
        (updatedUi.children || 0) +
        (updatedUi.infants || 0),
    );
    updatedUi.perPerson = this.round2(
      updatedUi.grandTotal / totalPax,
    );

    // ✅ price sync
    if (updated.price) {
      updated.price.base = String(updatedUi.baseFare);
      updated.price.total = String(updatedUi.totalBaseTax);
      updated.price.grandTotal = String(updatedUi.grandTotal);
      updated.price.tax = String(updatedUi.taxAmount);
      updated.price.markup = String(markupValue);
    }

    // ✅ admin sync
    if (updated.priceBreakdown?.admin) {
      updated.priceBreakdown.admin.markup = this.round2(
        Number(updated.priceBreakdown.admin.markup || 0) +
          markupValue,
      );
      updated.priceBreakdown.admin.offeredFare =
        updatedUi.customerInvoiceTotal;
      updated.priceBreakdown.admin.netReceivableFromAgent =
        updatedUi.grandTotal;
      updated.priceBreakdown.admin.grossProfit = this.round2(
        Number(updated.priceBreakdown.admin.grossProfit || 0) +
          markupValue,
      );
      updated.priceBreakdown.admin.netProfit = this.round2(
        Number(updated.priceBreakdown.admin.netProfit || 0) +
          markupValue,
      );
    }

    (updated as any)._appliedMarkup = {
      ruleId: rule.id,
      ruleType: rule.type,
      markupAmount: markupValue,
      markupOn: rule.markupOn,
      fixedPart,
      percentPart,
      currency: this.DISPLAY_CURRENCY,
    };

    return updated;
  }

  // ==========================================
  // Build Markup Context from Flight
  // ==========================================
  buildContext(
    flight: NormalizedFlight,
    overrides?: Partial<MarkupContext>,
  ): MarkupContext {
    const segments = flight.itineraries?.[0]?.segments ?? [];
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    return {
      airlineCode: firstSeg?.carrierCode || '',
      origin: firstSeg?.departure?.iataCode || '',
      destination: lastSeg?.arrival?.iataCode || '',
      ...overrides,
    };
  }

  // ==========================================
  // Private Helpers
  // ==========================================
  private findApplicableRules(
    rules: MarkupRule[],
    context: MarkupContext,
  ): MarkupRule[] {
    return rules.filter((m) => this.isApplicable(m, context));
  }

  private findBestRule(rules: MarkupRule[]): MarkupRule | null {
    if (!rules.length) return null;

    const order = [
      'ROUTE_AGENT',
      'AIRLINE_AGENT',
      'ROUTE',
      'AGENT',
      'AIRLINE',
      'GLOBAL',
    ];

    return [...rules].sort((a, b) => {
      const ra = order.indexOf(a.type);
      const rb = order.indexOf(b.type);
      if (ra !== rb) return ra - rb;
      return this.toNum(b.priority) - this.toNum(a.priority);
    })[0];
  }

  private isApplicable(
    rule: MarkupRule,
    ctx: MarkupContext,
  ): boolean {
    if (rule.isActive === false) return false;
    if (rule.deletedAt) return false;

    const now = new Date();
    if (rule.validFrom && new Date(rule.validFrom) > now)
      return false;
    if (rule.validTo && new Date(rule.validTo) < now)
      return false;

    const airline = this.normalize(ctx.airlineCode);
    const origin = this.normalize(ctx.origin);
    const destination = this.normalize(ctx.destination);
    const agentId = ctx.agentId || '';

    switch (rule.type) {
      case 'GLOBAL':
        return true;

      case 'AIRLINE':
        return this.normalize(rule.airlineCode) === airline;

      case 'ROUTE':
        return (
          this.normalize(rule.origin) === origin &&
          this.normalize(rule.destination) === destination
        );

      case 'AGENT':
        return !!rule.agentId && rule.agentId === agentId;

      case 'AIRLINE_AGENT':
        return (
          this.normalize(rule.airlineCode) === airline &&
          !!rule.agentId &&
          rule.agentId === agentId
        );

      case 'ROUTE_AGENT':
        return (
          this.normalize(rule.origin) === origin &&
          this.normalize(rule.destination) === destination &&
          !!rule.agentId &&
          rule.agentId === agentId
        );

      default:
        return false;
    }
  }
}