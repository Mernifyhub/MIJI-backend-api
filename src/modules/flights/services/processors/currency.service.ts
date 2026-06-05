import { Injectable } from '@nestjs/common';

const DISPLAY_CURRENCY = 'SAR';

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  USD: { USD: 1, SAR: 3.75, EUR: 0.92, GBP: 0.79, BDT: 110.0, AED: 3.67, INR: 83.5 },
  SAR: { SAR: 1, USD: 0.2667, EUR: 0.245, GBP: 0.211, BDT: 29.33, AED: 0.978, INR: 22.27 },
  EUR: { EUR: 1, USD: 1.087, SAR: 4.08, GBP: 0.859, BDT: 119.57, AED: 3.99, INR: 90.76 },
  GBP: { GBP: 1, USD: 1.266, SAR: 4.75, EUR: 1.164, BDT: 139.2, AED: 4.645, INR: 105.7 },
  BDT: { BDT: 1, USD: 0.00909, SAR: 0.0341, EUR: 0.00836, GBP: 0.00719, AED: 0.0334, INR: 0.759 },
  AED: { AED: 1, USD: 0.2725, SAR: 1.0225, EUR: 0.2506, GBP: 0.2153, BDT: 29.96, INR: 22.75 },
  INR: { INR: 1, USD: 0.01198, SAR: 0.0449, EUR: 0.01102, GBP: 0.00946, BDT: 1.317, AED: 0.04396 },
};

@Injectable()
export class CurrencyService {
  private round2(value: number): number {
    return Math.round((value || 0) * 100) / 100;
  }

  private normalizeCurrency(currency?: string | null): string {
    return String(currency || DISPLAY_CURRENCY).trim().toUpperCase();
  }

  convertCurrency(amount: number, from: string, to: string): number {
    const fromC = this.normalizeCurrency(from);
    const toC = this.normalizeCurrency(to);

    if (fromC === toC) return this.round2(amount);

    const directRate = EXCHANGE_RATES[fromC]?.[toC];
    if (directRate) return this.round2(amount * directRate);

    const toUsd = EXCHANGE_RATES[fromC]?.USD;
    const fromUsd = EXCHANGE_RATES.USD?.[toC];

    if (toUsd && fromUsd) {
      return this.round2(amount * toUsd * fromUsd);
    }

    return this.round2(amount);
  }

  getExchangeRate(from: string, to: string): number {
    const fromC = this.normalizeCurrency(from);
    const toC = this.normalizeCurrency(to);
    if (fromC === toC) return 1;
    const direct = EXCHANGE_RATES[fromC]?.[toC];
    if (direct) return this.round2(direct);
    const toUsd = EXCHANGE_RATES[fromC]?.USD;
    const fromUsd = EXCHANGE_RATES.USD?.[toC];
    if (toUsd && fromUsd) return this.round2(toUsd * fromUsd);
    return 1;
  }

  getDisplayCurrency(): string {
    return process.env.DISPLAY_CURRENCY || DISPLAY_CURRENCY;
  }
}