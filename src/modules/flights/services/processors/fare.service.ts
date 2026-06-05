import { Injectable } from '@nestjs/common';
import type {
  OtaPricingConfig,
  NormalizedFlight,
} from '../../types/flight.types';

@Injectable()
export class FareService {
  private safeNum(value: any): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private nonNeg(value: any): number {
    return Math.max(0, this.safeNum(value));
  }

  private round2(value: number): number {
    return Number(value.toFixed(2));
  }

  getDefaultConfig(): OtaPricingConfig {
    return {
      markup: Number(process.env.B2B_MARKUP || 0),
      serviceFee: Number(process.env.B2B_SERVICE_FEE || 0),
      convenienceFee: Number(process.env.B2B_CONVENIENCE_FEE || 0),
      transactionFee: Number(process.env.B2B_TRANSACTION_FEE || 0),
      paymentGatewayFee: Number(process.env.B2B_PAYMENT_GATEWAY_FEE || 0),
      agentDiscount: Number(process.env.B2B_AGENT_DISCOUNT || 0),
      promoDiscount: Number(process.env.B2B_PROMO_DISCOUNT || 0),
      commissionValue: Number(process.env.B2B_COMMISSION_VALUE || 0),
      commissionType: (process.env.B2B_COMMISSION_TYPE || 'flat') as 'flat' | 'percent',
      commissionOn: (process.env.B2B_COMMISSION_ON || 'base') as 'base' | 'supplier_total',
      commissionMode: (process.env.B2B_COMMISSION_MODE || 'deduct_from_agent_payable') as
        | 'deduct_from_agent_payable'
        | 'internal_only',
      aitRate: Number(process.env.B2B_AIT_RATE || 0),
      aitOn: (process.env.B2B_AIT_ON || 'supplier') as 'supplier' | 'selling',
      vatRate: Number(process.env.B2B_VAT_RATE || 0),
      roundOff: Number(process.env.B2B_ROUND_OFF || 0),
    };
  }

  calculateFare(
    input: {
      baseFare: number;
      taxAmount: number;
      discount?: number;
      currency?: string;
      adults?: number;
      children?: number;
      infants?: number;
      source?: 'supplier' | 'agent';
    },
    config?: OtaPricingConfig,
  ) {
    const cfg = config || this.getDefaultConfig();
    const source = input.source || 'supplier';
    const adults = Math.max(1, this.nonNeg(input.adults) || 1);
    const children = Math.max(0, this.nonNeg(input.children) || 0);
    const infants = Math.max(0, this.nonNeg(input.infants) || 0);
    const totalPax = adults + children + infants;
    const currency = input.currency || 'SAR';

    const inputBaseFare = this.round2(this.nonNeg(input.baseFare));
    const inputTaxAmount = this.round2(this.nonNeg(input.taxAmount));
    const inputDiscount = this.round2(this.nonNeg(input.discount));

    const configMarkup = this.round2(this.nonNeg(cfg.markup));
    const configServiceFee = this.round2(this.nonNeg(cfg.serviceFee));
    const configConvenienceFee = this.round2(this.nonNeg(cfg.convenienceFee));
    const configTransactionFee = this.round2(this.nonNeg(cfg.transactionFee));
    const configPaymentGatewayFee = this.round2(this.nonNeg(cfg.paymentGatewayFee));
    const configAgentDiscount = this.round2(this.nonNeg(cfg.agentDiscount));
    const configPromoDiscount = this.round2(this.nonNeg(cfg.promoDiscount));

    const commissionValue = this.nonNeg(cfg.commissionValue);
    const commissionType = cfg.commissionType ?? 'flat';
    const commissionOn = cfg.commissionOn ?? 'base';
    const commissionMode = cfg.commissionMode ?? 'deduct_from_agent_payable';
    const aitRate = this.nonNeg(cfg.aitRate);
    const aitOn = cfg.aitOn ?? 'supplier';
    const vatRate = this.nonNeg(cfg.vatRate);

    let agentBaseFare = 0;
    let agentTaxAmount = 0;
    let totalBaseTax = 0;
    let customerInvoiceTotal = 0;
    let discountOrCommission = 0;
    let grandTotal = 0;
    let perPerson = 0;

    let markup = 0;
    let serviceFee = 0;
    let convenienceFee = 0;
    let transactionFee = 0;
    let paymentGatewayFee = 0;
    let agentDiscount = 0;
    let promoDiscount = 0;
    let commission = 0;
    let ait = 0;
    let vat = 0;

    const supplierFare = this.round2(inputBaseFare + inputTaxAmount);

    if (source === 'supplier') {
      markup = configMarkup;
      serviceFee = configServiceFee;
      convenienceFee = configConvenienceFee;
      transactionFee = configTransactionFee;
      paymentGatewayFee = configPaymentGatewayFee;
      agentDiscount = configAgentDiscount || inputDiscount;
      promoDiscount = configPromoDiscount;

      const commissionBase =
        commissionOn === 'supplier_total' ? supplierFare : inputBaseFare;
      commission =
        commissionType === 'percent'
          ? this.round2((commissionBase * commissionValue) / 100)
          : this.round2(commissionValue);

      const preVatSell =
        supplierFare + markup + serviceFee + convenienceFee + transactionFee;
      const aitBase = aitOn === 'selling' ? preVatSell : supplierFare;
      ait = this.round2(aitBase * aitRate);

      const vatBase = markup + serviceFee + convenienceFee + transactionFee;
      vat = this.round2(vatBase * vatRate);

      agentBaseFare = this.round2(
        inputBaseFare + markup + serviceFee + convenienceFee + transactionFee,
      );
      agentTaxAmount = this.round2(inputTaxAmount + ait + vat);
      totalBaseTax = this.round2(agentBaseFare + agentTaxAmount);
      customerInvoiceTotal = totalBaseTax;

      const commissionDeduction =
        commissionMode === 'deduct_from_agent_payable' ? commission : 0;
      discountOrCommission = this.round2(
        agentDiscount + promoDiscount + commissionDeduction,
      );
      grandTotal = this.round2(
        Math.max(0, customerInvoiceTotal - discountOrCommission),
      );
    } else {
      agentBaseFare = inputBaseFare;
      agentTaxAmount = inputTaxAmount;
      totalBaseTax = this.round2(agentBaseFare + agentTaxAmount);
      customerInvoiceTotal = totalBaseTax;
      discountOrCommission = inputDiscount;
      grandTotal = this.round2(Math.max(0, customerInvoiceTotal - discountOrCommission));
    }

    perPerson = totalPax > 0 ? this.round2(grandTotal / totalPax) : grandTotal;

    const grossProfit = this.round2(markup + serviceFee + convenienceFee + transactionFee + commission);
    const netProfit = this.round2(grossProfit - agentDiscount - promoDiscount - paymentGatewayFee);
    const marginPercent = customerInvoiceTotal > 0
      ? this.round2((netProfit / customerInvoiceTotal) * 100)
      : 0;

    return {
      baseFare: agentBaseFare,
      taxAmount: agentTaxAmount,
      customerInvoiceTotal,
      discount: discountOrCommission,
      grandTotal,
      perPerson,
      currency,
      adults,
      children,
      infants,
      totalPax,
      agentUi: {
        baseFare: agentBaseFare,
        taxAmount: agentTaxAmount,
        totalBaseTax,
        customerInvoiceTotal,
        discountOrCommission,
        grandTotal,
        perPerson,
        currency,
        adults,
        children,
        infants,
        totalPax,
      },
      admin: {
        supplierFare,
        publishedFare: supplierFare,
        offeredFare: customerInvoiceTotal,
        markup,
        serviceFee,
        convenienceFee,
        transactionFee,
        agentDiscount,
        promoDiscount,
        commission,
        ait,
        vat,
        roundOff: 0,
        paymentGatewayFee,
        netPayableToSupplier: supplierFare,
        netReceivableFromAgent: grandTotal,
        grossProfit,
        netProfit,
        marginPercent,
      },
      markup: null,
      meta: {
        commissionType,
        commissionMode,
        commissionOn,
        aitOn,
        source,
      },
    };
  }
}