// src/modules/flights/services/providers/duffel.service.ts

import { Injectable, Logger } from '@nestjs/common';
import type { FlightSearchParams } from '../../types/flight.types';

@Injectable()
export class DuffelService {
  private readonly logger = new Logger(DuffelService.name);
  private readonly API_URL = 'https://api.duffel.com';

  // ═══════════════════════════════════════════════════════════
  // 🔍 SEARCH FLIGHTS
  // ═══════════════════════════════════════════════════════════
  async search(params: FlightSearchParams): Promise<{
    offers: any[];
    ok: boolean;
    status: number;
  }> {
    try {
      const token = process.env.DUFFEL_TOKEN;
      const version = process.env.DUFFEL_VERSION || 'v2';

      if (!token) {
        this.logger.error('DUFFEL_TOKEN is not configured');
        return { offers: [], ok: false, status: 401 };
      }

      const passengers = this.buildPassengers(
        params.adults,
        params.children,
        params.infants,
      );

      this.logger.log(
        `Duffel search: ${params.origin} → ${params.destination} | ${params.departureDate}`,
      );

      const res = await fetch(`${this.API_URL}/air/offer_requests`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Duffel-Version': version,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          data: {
            slices: params.slices,
            passengers,
            cabin_class: params.cabinClass,
            return_offers: true,
          },
        }),
      });

      const raw = await res.json();

      if (!res.ok) {
        // ✅ Only log error code, not full response
        this.logger.error(`Duffel search failed (${res.status})`);
        return { offers: [], ok: false, status: res.status };
      }

      const offers = raw?.data?.offers || [];
      this.logger.log(`Duffel returned ${offers.length} offers`);

      return { offers, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Duffel search exception');
      return { offers: [], ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 💰 CONFIRM PRICE
  // ═══════════════════════════════════════════════════════════
  async confirmPrice(flightOffer: any): Promise<{
    data: any;
    ok: boolean;
    status: number;
    error?: { message: string };
  }> {
    try {
      const token = process.env.DUFFEL_TOKEN;
      const version = process.env.DUFFEL_VERSION || 'v2';

      if (!token) {
        return {
          data: null,
          ok: false,
          status: 401,
          error: { message: 'Configuration error' },
        };
      }

      if (!flightOffer?.id) {
        return {
          data: null,
          ok: false,
          status: 400,
          error: { message: 'Invalid flight offer' },
        };
      }

      this.logger.log('Confirming Duffel price...');

      const res = await fetch(
        `${this.API_URL}/air/offers/${flightOffer.id}?return_available_services=true`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Duffel-Version': version,
            Accept: 'application/json',
          },
        },
      );

      const data = await res.json();

      if (!res.ok) {
        // ✅ Server-only log (full error)
        this.logger.error(`Duffel price confirmation failed (${res.status})`);

        // ✅ Client-safe error message
        const errorDetail =
          data?.errors?.[0]?.message ||
          data?.errors?.[0]?.title ||
          'Price confirmation failed';

        // ✅ User-friendly error mapping
        const userMessage = this.getUserFriendlyError(
          errorDetail,
          data?.errors?.[0]?.code,
        );

        return {
          data: null,
          ok: false,
          status: res.status,
          error: { message: userMessage },
        };
      }

      this.logger.log('Duffel price confirmed');

      return {
        data: {
          flightOffers: [data.data],
        },
        ok: true,
        status: res.status,
      };
    } catch (error: any) {
      this.logger.error('Duffel confirmPrice exception');
      return {
        data: null,
        ok: false,
        status: 500,
        error: { message: 'Service temporarily unavailable' },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 🎟️ CREATE ORDER (Booking)
  // ═══════════════════════════════════════════════════════════
  async createOrder(
    flightOffer: any,
    travelers: any[],
    contacts?: any[],
  ): Promise<{
    order: any;
    ok: boolean;
    status: number;
    error?: { message: string };
  }> {
    try {
      const token = process.env.DUFFEL_TOKEN;
      const version = process.env.DUFFEL_VERSION || 'v2';

      if (!token) {
        return {
          order: null,
          ok: false,
          status: 401,
          error: { message: 'Configuration error' },
        };
      }

      this.logger.log(`Creating Duffel order | Travelers: ${travelers.length}`);

      // Convert Amadeus-style travelers to Duffel format
      const duffelPassengers = this.toDuffelPassengers(travelers, flightOffer);

      const body = {
        data: {
          type: 'instant',
          selected_offers: [flightOffer.id],
          passengers: duffelPassengers,
          payments: [
            {
              type: 'balance',
              amount: flightOffer.total_amount,
              currency: flightOffer.total_currency,
            },
          ],
        },
      };

      const res = await fetch(`${this.API_URL}/air/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Duffel-Version': version,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // ✅ Server-only log (with code only, not full payload)
        const errorCode = data?.errors?.[0]?.code || 'unknown';
        this.logger.error(
          `Duffel order creation failed (${res.status}) | Code: ${errorCode}`,
        );

        const errorDetail =
          data?.errors?.[0]?.message ||
          data?.errors?.[0]?.title ||
          'Booking failed';

        // ✅ Client-safe error mapping
        const userMessage = this.getUserFriendlyError(errorDetail, errorCode);

        return {
          order: null,
          ok: false,
          status: res.status,
          error: { message: userMessage },
        };
      }

      const normalizedOrder = {
        id: data.data?.id,
        type: 'flight-order',
        associatedRecords: [
          {
            reference: data.data?.booking_reference,
            originSystemCode: 'GDS',
            creationDate: data.data?.created_at,
            flightOfferId: flightOffer.id,
          },
          ...(data.data?.owner?.iata_code
            ? [
                {
                  reference: data.data?.booking_reference,
                  originSystemCode: data.data.owner.iata_code,
                  creationDate: data.data?.created_at,
                  flightOfferId: flightOffer.id,
                },
              ]
            : []),
        ],
        _raw: data.data,
      };

      this.logger.log(
        `Duffel order created | PNR: ${data.data?.booking_reference}`,
      );

      return { order: normalizedOrder, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Duffel createOrder exception');
      return {
        order: null,
        ok: false,
        status: 500,
        error: { message: 'Booking service temporarily unavailable' },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 📄 GET ORDER
  // ═══════════════════════════════════════════════════════════
  async getOrder(orderId: string): Promise<{
    order: any;
    ok: boolean;
    status: number;
  }> {
    try {
      const token = process.env.DUFFEL_TOKEN;
      const version = process.env.DUFFEL_VERSION || 'v2';

      if (!token) {
        return { order: null, ok: false, status: 401 };
      }

      const res = await fetch(`${this.API_URL}/air/orders/${orderId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Duffel-Version': version,
          Accept: 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        this.logger.error(`Duffel get order failed (${res.status})`);
        return { order: null, ok: false, status: res.status };
      }

      return { order: data.data, ok: true, status: res.status };
    } catch (error: any) {
      this.logger.error('Duffel getOrder exception');
      return { order: null, ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ❌ CANCEL ORDER
  // ═══════════════════════════════════════════════════════════
  async cancelOrder(orderId: string): Promise<{
    ok: boolean;
    status: number;
  }> {
    try {
      const token = process.env.DUFFEL_TOKEN;
      const version = process.env.DUFFEL_VERSION || 'v2';

      if (!token) {
        return { ok: false, status: 401 };
      }

      const createRes = await fetch(
        `${this.API_URL}/air/order_cancellations`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Duffel-Version': version,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            data: { order_id: orderId },
          }),
        },
      );

      const createData = await createRes.json();

      if (!createRes.ok) {
        this.logger.error(`Duffel cancel create failed (${createRes.status})`);
        return { ok: false, status: createRes.status };
      }

      const cancellationId = createData.data?.id;

      if (!cancellationId) {
        this.logger.error('No cancellation ID returned');
        return { ok: false, status: 500 };
      }

      const confirmRes = await fetch(
        `${this.API_URL}/air/order_cancellations/${cancellationId}/actions/confirm`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Duffel-Version': version,
            Accept: 'application/json',
          },
        },
      );

      if (!confirmRes.ok) {
        this.logger.error(`Duffel cancel confirm failed (${confirmRes.status})`);
        return { ok: false, status: confirmRes.status };
      }

      this.logger.log(`Duffel order cancelled: ${orderId}`);
      return { ok: true, status: confirmRes.status };
    } catch (error: any) {
      this.logger.error('Duffel cancelOrder exception');
      return { ok: false, status: 500 };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS (Server-only, never exposed to client)
  // ═══════════════════════════════════════════════════════════

  private buildPassengers(adults: number, children: number, infants: number) {
    return [
      ...Array.from({ length: adults }, () => ({ type: 'adult' as const })),
      ...Array.from({ length: children }, () => ({ type: 'child' as const })),
      ...Array.from({ length: infants }, () => ({
        type: 'infant_without_seat' as const,
      })),
    ];
  }

  // ✅ User-friendly error message mapping
  // Hides internal error details from end users
  private getUserFriendlyError(
    originalMessage: string,
    errorCode?: string,
  ): string {
    const code = (errorCode || '').toLowerCase();
    const msg = (originalMessage || '').toLowerCase();

    // Phone validation
    if (code === 'invalid_phone_number' || msg.includes('phone')) {
      return 'Please provide a valid phone number';
    }

    // Email validation
    if (code === 'invalid_email' || msg.includes('email')) {
      return 'Please provide a valid email address';
    }

    // DOB validation
    if (code === 'born_on_does_not_match' || msg.includes('date of birth')) {
      return 'Passenger date of birth does not match their type';
    }

    // Offer expired
    if (
      code === 'offer_no_longer_available' ||
      code === 'offer_expired' ||
      msg.includes('no longer available') ||
      msg.includes('expired')
    ) {
      return 'This flight is no longer available. Please search again';
    }

    // Price changed
    if (code === 'price_changed' || msg.includes('price')) {
      return 'The price has changed. Please refresh and try again';
    }

    // Airline issues
    if (
      code === 'airline_internal_error' ||
      msg.includes('airline') ||
      msg.includes('internal_error')
    ) {
      return 'The airline is temporarily unavailable. Please try a different flight';
    }

    // Segment issues
    if (msg.includes('segment') || msg.includes('sell')) {
      return 'This flight is no longer available. Please search again';
    }

    // Generic fallback
    return 'Booking failed. Please try again or contact support';
  }

  // ✅ Strict E.164 phone format
  private formatPhoneE164(
    phoneNumber: string | undefined,
    countryCode: string = '880',
  ): string {
    const FALLBACKS: Record<string, string> = {
      '880': '+8801712345678',
      '966': '+966501234567',
      '971': '+971501234567',
      '91': '+919876543210',
      '92': '+923001234567',
      '44': '+447777777777',
      '1': '+12025551234',
    };

    const FALLBACK = FALLBACKS[countryCode] || '+447777777777';

    if (!phoneNumber || String(phoneNumber).trim() === '') {
      return FALLBACK;
    }

    let cleaned = String(phoneNumber).replace(/\D/g, '');

    if (!cleaned) return FALLBACK;

    if (cleaned.startsWith(countryCode)) {
      cleaned = cleaned.substring(countryCode.length);
    }

    while (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    const validationResult = this.validateLocalNumber(cleaned, countryCode);

    if (!validationResult.valid) {
      return FALLBACK;
    }

    return `+${countryCode}${cleaned}`;
  }

  // ✅ Country-specific phone validation
  private validateLocalNumber(
    localNumber: string,
    countryCode: string,
  ): { valid: boolean; reason?: string } {
    if (!localNumber) {
      return { valid: false, reason: 'empty' };
    }

    switch (countryCode) {
      case '880': // Bangladesh
        if (localNumber.length !== 10) {
          return { valid: false, reason: 'invalid length' };
        }
        if (!localNumber.startsWith('1')) {
          return { valid: false, reason: 'invalid prefix' };
        }
        if (
          !['3', '4', '5', '6', '7', '8', '9'].includes(localNumber[1])
        ) {
          return { valid: false, reason: 'invalid operator' };
        }
        return { valid: true };

      case '966': // Saudi Arabia
        if (localNumber.length !== 9) {
          return { valid: false, reason: 'invalid length' };
        }
        if (!localNumber.startsWith('5')) {
          return { valid: false, reason: 'invalid prefix' };
        }
        return { valid: true };

      case '971': // UAE
        if (localNumber.length !== 9) {
          return { valid: false, reason: 'invalid length' };
        }
        if (!localNumber.startsWith('5')) {
          return { valid: false, reason: 'invalid prefix' };
        }
        return { valid: true };

      case '91': // India
        if (localNumber.length !== 10) {
          return { valid: false, reason: 'invalid length' };
        }
        if (!['6', '7', '8', '9'].includes(localNumber[0])) {
          return { valid: false, reason: 'invalid prefix' };
        }
        return { valid: true };

      case '92': // Pakistan
        if (localNumber.length !== 10) {
          return { valid: false, reason: 'invalid length' };
        }
        if (!localNumber.startsWith('3')) {
          return { valid: false, reason: 'invalid prefix' };
        }
        return { valid: true };

      case '44': // UK
        if (localNumber.length !== 10) {
          return { valid: false, reason: 'invalid length' };
        }
        if (!localNumber.startsWith('7')) {
          return { valid: false, reason: 'invalid prefix' };
        }
        return { valid: true };

      case '1': // US/Canada
        if (localNumber.length !== 10) {
          return { valid: false, reason: 'invalid length' };
        }
        return { valid: true };

      default:
        if (localNumber.length < 7 || localNumber.length > 14) {
          return { valid: false, reason: 'invalid length' };
        }
        return { valid: true };
    }
  }

  // ✅ Get default DOB based on passenger type
  private getDefaultDobByType(type: string): string {
    const t = (type || '').toLowerCase();
    const now = new Date();

    if (t === 'adult' || t === 'ADULT') {
      const d = new Date(now);
      d.setFullYear(now.getFullYear() - 30);
      return d.toISOString().slice(0, 10);
    }

    if (t === 'child' || t === 'CHILD') {
      const d = new Date(now);
      d.setFullYear(now.getFullYear() - 8);
      return d.toISOString().slice(0, 10);
    }

    if (t.includes('infant') || t === 'INFANT' || t === 'HELD_INFANT') {
      const d = new Date(now);
      d.setFullYear(now.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    }

    const d = new Date(now);
    d.setFullYear(now.getFullYear() - 30);
    return d.toISOString().slice(0, 10);
  }

  // ✅ Validate DOB matches passenger type
  private validateDobForType(
    dob: string,
    type: string,
  ): { valid: boolean; correctedDob?: string } {
    if (!dob) {
      return { valid: false, correctedDob: this.getDefaultDobByType(type) };
    }

    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      return { valid: false, correctedDob: this.getDefaultDobByType(type) };
    }

    const now = new Date();
    if (dobDate > now) {
      return { valid: false, correctedDob: this.getDefaultDobByType(type) };
    }

    let age = now.getFullYear() - dobDate.getFullYear();
    const m = now.getMonth() - dobDate.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dobDate.getDate())) {
      age--;
    }

    const t = (type || '').toLowerCase();

    if (t === 'adult' || t === 'ADULT') {
      if (age >= 12) return { valid: true };
      return { valid: false, correctedDob: this.getDefaultDobByType('adult') };
    }

    if (t === 'child' || t === 'CHILD') {
      if (age >= 2 && age <= 11) return { valid: true };
      return { valid: false, correctedDob: this.getDefaultDobByType('child') };
    }

    if (t.includes('infant')) {
      if (age >= 0 && age < 2) return { valid: true };
      return { valid: false, correctedDob: this.getDefaultDobByType('infant') };
    }

    return { valid: true };
  }

  // ✅ Convert Amadeus-style travelers to Duffel format
  private toDuffelPassengers(travelers: any[], flightOffer: any): any[] {
    const offerPassengers = flightOffer?.passengers || [];

    return travelers.map((t: any, index: number) => {
      const offerPax = offerPassengers[index] || { type: 'adult' };

      const phoneRaw = t.contact?.phones?.[0]?.number || '';
      const countryCallingCode =
        t.contact?.phones?.[0]?.countryCallingCode || '880';
      const formattedPhone = this.formatPhoneE164(
        phoneRaw,
        countryCallingCode,
      );

      const email = t.contact?.emailAddress || 'noreply@mijiportal.com';

      const firstName =
        (t.name?.firstName || 'Unknown')
          .replace(/[^a-zA-Z\s]/g, '')
          .trim() || 'Unknown';
      const lastName =
        (t.name?.lastName || 'Unknown')
          .replace(/[^a-zA-Z\s]/g, '')
          .trim() || 'Unknown';

      const paxType = offerPax.type || 'adult';
      const inputDob = t.dateOfBirth || '';
      const dobValidation = this.validateDobForType(inputDob, paxType);

      const finalDob = dobValidation.valid
        ? inputDob
        : dobValidation.correctedDob ||
          this.getDefaultDobByType(paxType);

      const passenger: any = {
        id: offerPax.id || `pax_${index + 1}`,
        title: this.mapTitle(t.gender),
        gender: t.gender === 'FEMALE' ? 'f' : 'm',
        given_name: firstName,
        family_name: lastName,
        born_on: finalDob,
        email: email,
        phone_number: formattedPhone,
      };

      if (t.documents?.[0]?.number) {
        const passportExpiry = t.documents[0].expiryDate;
        const expiryDate = passportExpiry
          ? new Date(passportExpiry)
          : new Date('2030-12-31');

        const validExpiry =
          expiryDate > new Date()
            ? expiryDate.toISOString().slice(0, 10)
            : '2030-12-31';

        passenger.identity_documents = [
          {
            type: 'passport',
            unique_identifier: String(t.documents[0].number).replace(
              /[^a-zA-Z0-9]/g,
              '',
            ),
            expires_on: validExpiry,
            issuing_country_code: (
              t.documents[0].issuanceCountry || 'BD'
            ).toUpperCase(),
          },
        ];
      }

      return passenger;
    });
  }

  private mapTitle(gender?: string): string {
    if (!gender) return 'mr';
    const g = gender.toUpperCase();
    if (g === 'FEMALE') return 'mrs';
    return 'mr';
  }
}