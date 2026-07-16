// src/modules/flights/services/processors/normalizer.service.ts
import { Injectable } from '@nestjs/common';
import { FareService } from './fare.service';
import type {
  NormalizedFlight,
  PassengerFare,
  PaxWisePricing,
} from '../../types/flight.types';

interface Layover {
  airport: string;
  cityName: string;
  duration: string;
}

@Injectable()
export class NormalizerService {
  constructor(private readonly fareService: FareService) {}

  // ==================== HELPERS ====================

  private minutesToIso(minutes: number): string {
    const safe = Math.max(0, minutes);
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `PT${h}H${m}M`;
  }

  private toNum(value: any): number {
    const n = parseFloat(value ?? '0');
    return Number.isFinite(n) ? n : 0;
  }

  private toMoney(value: number): string {
    return value.toFixed(2);
  }

  private addMinutesToDateStr(dateStr: string, minutes: number): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      d.setMinutes(d.getMinutes() + Math.max(0, minutes));
      return d.toISOString();
    } catch {
      return dateStr;
    }
  }

  private isoDurationToMinutes(duration: string): number {
    if (!duration) return 0;
    const h = parseInt(duration.match(/(\d+)H/)?.[1] || '0');
    const m = parseInt(duration.match(/(\d+)M/)?.[1] || '0');
    return h * 60 + m;
  }

  // ==================== DUFFEL NORMALIZER ====================

  normalizeDuffelOffer(offer: any): NormalizedFlight {
    const total = this.toNum(offer.total_amount);
    const base = this.toNum(offer.base_amount || offer.total_amount);
    const tax = Math.max(0, total - base);

    const fareInput = {
      baseFare: base,
      taxAmount: tax,
      currency: offer.total_currency || 'USD',
      adults:
        offer.passengers?.filter((p: any) => p.type === 'adult').length || 1,
      children:
        offer.passengers?.filter((p: any) => p.type === 'child').length || 0,
      infants:
        offer.passengers?.filter(
          (p: any) => p.type === 'infant_without_seat',
        ).length || 0,
      source: 'supplier' as const,
    };

    const priceBreakdown = this.fareService.calculateFare(fareInput);

    const price = {
      total: this.toMoney(priceBreakdown.agentUi.totalBaseTax),
      grandTotal: this.toMoney(priceBreakdown.agentUi.grandTotal),
      base: this.toMoney(priceBreakdown.agentUi.baseFare),
      tax: this.toMoney(priceBreakdown.agentUi.taxAmount),
      markup: this.toMoney(priceBreakdown.admin.markup),
      ait: this.toMoney(priceBreakdown.admin.ait),
      currency: priceBreakdown.currency,
    };

    // ✅ Extract Duffel per-passenger pricing
    const duffelPassengers = offer.passengers || [];
    const passengerFares: PassengerFare[] = this.extractDuffelPaxFares(
      offer,
      duffelPassengers,
    );
    const paxWisePricing = this.buildPaxWisePricing(passengerFares);

    const firstSeg = offer.slices?.[0]?.segments?.[0];
    const firstBaggages = firstSeg?.passengers?.[0]?.baggages || [];
    const checkedBag = firstBaggages.find((b: any) => b.type === 'checked');
    const carryBag = firstBaggages.find((b: any) => b.type === 'carry_on');

    const baggageInfo = {
      checked: checkedBag
        ? `${checkedBag.quantity} ${checkedBag.quantity > 1 ? 'Bags' : 'Bag'}`
        : 'Not Included',
      cabin: carryBag
        ? `${carryBag.quantity} ${carryBag.quantity > 1 ? 'Bags' : 'Bag'}`
        : 'Not Included',
      checkedRaw: checkedBag?.quantity || 0,
      cabinRaw: carryBag?.quantity || 0,
    };

    const itineraries = (offer.slices || []).map((slice: any) => {
      const segments = (slice.segments || []).map((seg: any) => {
        const segBaggages = seg.passengers?.[0]?.baggages || [];
        const segChecked = segBaggages.find((b: any) => b.type === 'checked');
        const segCarry = segBaggages.find((b: any) => b.type === 'carry_on');

        return {
          carrierCode:
            seg.operating_carrier?.iata_code ||
            seg.marketing_carrier?.iata_code ||
            '??',
          number:
            seg.marketing_carrier_flight_number ||
            seg.operating_carrier_flight_number ||
            '???',
          departure: {
            iataCode: seg.origin?.iata_code || '???',
            at: seg.departing_at || '',
            terminal: seg.origin?.terminal || null,
            cityName: seg.origin?.city_name || seg.origin?.name || '',
            airport: seg.origin?.name || '',
          },
          arrival: {
            iataCode: seg.destination?.iata_code || '???',
            at: seg.arriving_at || '',
            terminal: seg.destination?.terminal || null,
            cityName:
              seg.destination?.city_name || seg.destination?.name || '',
            airport: seg.destination?.name || '',
          },
          duration: seg.duration || '',
          stopCount: seg.stops?.length || 0,
          aircraft: {
            code: seg.aircraft?.iata_code || '',
            name: seg.aircraft?.name || 'Aircraft',
          },
          operatingCarrier: {
            name: seg.operating_carrier?.name || '',
            code: seg.operating_carrier?.iata_code || '',
          },
          marketingCarrier: {
            name: seg.marketing_carrier?.name || '',
            code: seg.marketing_carrier?.iata_code || '',
          },
          cabin: seg.passengers?.[0]?.cabin_class || 'economy',
          cabinName:
            seg.passengers?.[0]?.cabin_class_marketing_name || 'Economy',
          baggage: {
            checked: segChecked?.quantity || 0,
            cabin: segCarry?.quantity || 0,
          },
          fareBasis: seg.passengers?.[0]?.fare_basis_code || '',
        };
      });

      const layovers: Layover[] = [];
      for (let i = 0; i < slice.segments.length - 1; i++) {
        const curr = slice.segments[i];
        const next = slice.segments[i + 1];
        const diffMinutes = Math.round(
          (new Date(next.departing_at).getTime() -
            new Date(curr.arriving_at).getTime()) /
            60000,
        );
        layovers.push({
          airport: curr.destination?.iata_code || '',
          cityName:
            curr.destination?.city_name || curr.destination?.name || '',
          duration: this.minutesToIso(diffMinutes),
        });
      }

      return {
        duration: slice.duration || '',
        segments,
        fareBrandName: slice.fare_brand_name || '',
        stopCount: Math.max(0, segments.length - 1),
        layovers,
      };
    });

    const refund = offer.conditions?.refund_before_departure;
    const change = offer.conditions?.change_before_departure;

    const conditions = {
      refundable: refund?.allowed === true,
      changeable: change?.allowed === true,
      refundPenalty: refund?.penalty_amount || null,
      changePenalty: change?.penalty_amount || null,
      penaltyCurrency:
        refund?.penalty_currency ||
        change?.penalty_currency ||
        price.currency,
    };

    return {
      id: offer.id,
      price,
      priceBreakdown,
      passengerFares,       // ✅
      paxWisePricing,       // ✅
      itineraries,
      conditions,
      baggageInfo,
      provider: 'duffel',
      _duffel: {
        owner: offer.owner?.name || '',
        ownerCode: offer.owner?.iata_code || '',
        ownerLogo: offer.owner?.logo_symbol_url || '',
        passengers: offer.passengers || [],
        paymentRequirements: offer.payment_requirements || {},
        expiresAt: offer.expires_at || '',
        totalEmissions: offer.total_emissions_kg || null,
        rawOffer: offer,
      },
    };
  }

  normalizeDuffelOffers(offers: any[]): NormalizedFlight[] {
    return offers.map((offer) => this.normalizeDuffelOffer(offer));
  }

  // ==================== AMADEUS NORMALIZER ====================

  normalizeAmadeusOffer(
    offer: any,
    searchParams?: {
      adults?: number;
      children?: number;
      infants?: number;
    },
  ): NormalizedFlight {
    const grandTotal = this.toNum(
      offer?.price?.grandTotal || offer?.price?.total || 0,
    );
    const base = this.toNum(offer?.price?.base || grandTotal * 0.8);
    const tax = Math.max(0, grandTotal - base);
    const currency = offer?.price?.currency || 'USD';

    const travelerPricings = offer?.travelerPricings || [];
    const adults =
      searchParams?.adults ||
      travelerPricings.filter((t: any) => t.travelerType === 'ADULT').length ||
      1;
    const children =
      searchParams?.children ||
      travelerPricings.filter((t: any) => t.travelerType === 'CHILD').length ||
      0;
    const infants =
      searchParams?.infants ||
      travelerPricings.filter(
        (t: any) =>
          t.travelerType === 'HELD_INFANT' ||
          t.travelerType === 'SEATED_INFANT',
      ).length || 0;

    const fareInput = {
      baseFare: base,
      taxAmount: tax,
      currency,
      adults,
      children,
      infants,
      source: 'supplier' as const,
    };

    const priceBreakdown = this.fareService.calculateFare(fareInput);

    const price = {
      total: this.toMoney(priceBreakdown.agentUi.totalBaseTax),
      grandTotal: this.toMoney(priceBreakdown.agentUi.grandTotal),
      base: this.toMoney(priceBreakdown.agentUi.baseFare),
      tax: this.toMoney(priceBreakdown.agentUi.taxAmount),
      markup: this.toMoney(priceBreakdown.admin.markup),
      ait: this.toMoney(priceBreakdown.admin.ait),
      currency: priceBreakdown.currency,
    };

    // ✅ Extract Amadeus per-passenger pricing
    const passengerFares: PassengerFare[] = this.extractAmadeusPaxFares(
      travelerPricings,
      currency,
    );
    const paxWisePricing = this.buildPaxWisePricing(passengerFares);

    const itineraries = (offer?.itineraries || []).map((itin: any) => {
      const segments = (itin?.segments || []).map((seg: any) => {
        const travelerFare = travelerPricings[0];
        const fareDetail = travelerFare?.fareDetailsBySegment?.find(
          (fd: any) => fd.segmentId === seg.id,
        );

        const cabin = (fareDetail?.cabin || 'ECONOMY').toLowerCase();
        const cabinName =
          fareDetail?.cabin === 'BUSINESS'
            ? 'Business'
            : fareDetail?.cabin === 'FIRST'
              ? 'First'
              : fareDetail?.cabin === 'PREMIUM_ECONOMY'
                ? 'Premium Economy'
                : 'Economy';

        const checkedBagsQty =
          fareDetail?.includedCheckedBags?.quantity || 0;
        const checkedBagsWeight =
          fareDetail?.includedCheckedBags?.weight || 0;

        return {
          carrierCode:
            seg?.carrierCode || seg?.operating?.carrierCode || '??',
          number: seg?.number || '???',
          departure: {
            iataCode: seg?.departure?.iataCode || '???',
            at: seg?.departure?.at || '',
            terminal: seg?.departure?.terminal || null,
            cityName: seg?.departure?.iataCode || '',
            airport: seg?.departure?.iataCode || '',
          },
          arrival: {
            iataCode: seg?.arrival?.iataCode || '???',
            at: seg?.arrival?.at || '',
            terminal: seg?.arrival?.terminal || null,
            cityName: seg?.arrival?.iataCode || '',
            airport: seg?.arrival?.iataCode || '',
          },
          duration: seg?.duration || '',
          stopCount: seg?.numberOfStops || 0,
          aircraft: {
            code: seg?.aircraft?.code || '',
            name: seg?.aircraft?.code || 'Aircraft',
          },
          operatingCarrier: {
            name: seg?.operating?.carrierCode || seg?.carrierCode || '',
            code: seg?.operating?.carrierCode || seg?.carrierCode || '',
          },
          marketingCarrier: {
            name: seg?.carrierCode || '',
            code: seg?.carrierCode || '',
          },
          cabin,
          cabinName,
          baggage: {
            checked: checkedBagsQty || (checkedBagsWeight > 0 ? 1 : 0),
            cabin: 0,
          },
          fareBasis: fareDetail?.fareBasis || '',
        };
      });

      const layovers: Layover[] = [];
      for (let i = 0; i < segments.length - 1; i++) {
        const curr = segments[i];
        const next = segments[i + 1];
        if (curr?.arrival?.at && next?.departure?.at) {
          const diffMinutes = Math.round(
            (new Date(next.departure.at).getTime() -
              new Date(curr.arrival.at).getTime()) /
              60000,
          );
          layovers.push({
            airport: curr.arrival.iataCode,
            cityName: curr.arrival.cityName || curr.arrival.iataCode,
            duration: this.minutesToIso(diffMinutes),
          });
        }
      }

      return {
        duration: itin?.duration || '',
        segments,
        fareBrandName: '',
        stopCount: Math.max(0, segments.length - 1),
        layovers,
      };
    });

    const firstTravelerFare = travelerPricings[0];
    const firstFareDetail = firstTravelerFare?.fareDetailsBySegment?.[0];
    const firstCheckedQty =
      firstFareDetail?.includedCheckedBags?.quantity || 0;
    const firstCheckedWeight =
      firstFareDetail?.includedCheckedBags?.weight || 0;

    const baggageInfo = {
      checked:
        firstCheckedQty > 0
          ? `${firstCheckedQty} Bag${firstCheckedQty > 1 ? 's' : ''}`
          : firstCheckedWeight > 0
            ? `${firstCheckedWeight}kg`
            : 'Not Included',
      cabin: 'Not Included',
      checkedRaw: firstCheckedQty || (firstCheckedWeight > 0 ? 1 : 0),
      cabinRaw: 0,
    };

    const conditions = {
      refundable: offer?.pricingOptions?.refundableFare === true || false,
      changeable: false,
      refundPenalty: null,
      changePenalty: null,
      penaltyCurrency: currency,
    };

    const firstItinFirstSeg = offer?.itineraries?.[0]?.segments?.[0];

    return {
      id: offer?.id || `AM-${Date.now()}`,
      price,
      priceBreakdown,
      passengerFares,       // ✅
      paxWisePricing,       // ✅
      itineraries,
      conditions,
      baggageInfo,
      provider: 'amadeus',
      _amadeus: {
        lastTicketingDate: offer?.lastTicketingDate || '',
        lastTicketingDateTime: offer?.lastTicketingDateTime || '',
        numberOfBookableSeats: offer?.numberOfBookableSeats || 0,
        oneWay: offer?.oneWay || false,
        instantTicketingRequired:
          offer?.pricingOptions?.includedCheckedBagsOnly || false,
        validatingAirlineCodes: offer?.validatingAirlineCodes || [],
        carrierCode: firstItinFirstSeg?.carrierCode || '',
        rawOffer: offer,
      },
    };
  }

  normalizeAmadeusOffers(
    offers: any[],
    searchParams?: {
      adults?: number;
      children?: number;
      infants?: number;
    },
  ): NormalizedFlight[] {
    return offers.map((o) => this.normalizeAmadeusOffer(o, searchParams));
  }

  // ==================== TRAVELPAYOUTS NORMALIZER ====================

  normalizeTravelpayoutsOffer(
    offer: any,
    searchParams?: {
      adults?: number;
      children?: number;
      infants?: number;
      cabinClass?: string;
    },
  ): NormalizedFlight {
    const total = this.toNum(offer.price || 0);
    const sourceCurrency = String(offer?.currency || 'USD').toUpperCase();

    const fareInput = {
      baseFare: total,
      taxAmount: 0,
      currency: sourceCurrency,
      adults: searchParams?.adults || 1,
      children: searchParams?.children || 0,
      infants: searchParams?.infants || 0,
      source: 'supplier' as const,
    };

    const priceBreakdown = this.fareService.calculateFare(fareInput);

    const price = {
      total: this.toMoney(priceBreakdown.agentUi.totalBaseTax),
      grandTotal: this.toMoney(priceBreakdown.agentUi.grandTotal),
      base: this.toMoney(priceBreakdown.agentUi.baseFare),
      tax: this.toMoney(priceBreakdown.agentUi.taxAmount),
      markup: this.toMoney(priceBreakdown.admin.markup),
      ait: this.toMoney(priceBreakdown.admin.ait),
      currency: priceBreakdown.currency,
    };

    // ✅ Travelpayouts: pax-wise নাই, তাই estimated based on standard ratios
    const passengerFares: PassengerFare[] = this.estimateTravelpayoutsPaxFares(
      total,
      sourceCurrency,
      searchParams,
    );
    const paxWisePricing = this.buildPaxWisePricing(passengerFares);

    const cabin = (searchParams?.cabinClass || 'economy').toLowerCase();
    const cabinName =
      cabin === 'business'
        ? 'Business'
        : cabin === 'first'
          ? 'First'
          : cabin === 'premium_economy'
            ? 'Premium Economy'
            : 'Economy';

    const durationToMinutes = this.toNum(offer.duration_to || 0);
    const durationBackMinutes = this.toNum(offer.duration_back || 0);
    const transfers = this.toNum(offer.transfers || 0);
    const returnTransfers = this.toNum(offer.return_transfers || 0);

    const outboundDepartureAt = offer.departure_at || '';
    const outboundArrivalAt = this.addMinutesToDateStr(
      outboundDepartureAt,
      durationToMinutes,
    );

    const outboundSegments = [
      {
        carrierCode: offer.airline || '??',
        number: offer.flight_number || '',
        departure: {
          iataCode: String(offer.origin || '???').toUpperCase(),
          at: outboundDepartureAt,
          terminal: null,
          cityName: String(offer.origin || ''),
          airport: String(offer.origin || ''),
        },
        arrival: {
          iataCode: String(offer.destination || '???').toUpperCase(),
          at: outboundArrivalAt,
          terminal: null,
          cityName: String(offer.destination || ''),
          airport: String(offer.destination || ''),
        },
        duration: this.minutesToIso(durationToMinutes),
        stopCount: transfers,
        aircraft: { code: '', name: 'Aircraft' },
        operatingCarrier: {
          name: offer.airline || '',
          code: offer.airline || '',
        },
        marketingCarrier: {
          name: offer.airline || '',
          code: offer.airline || '',
        },
        cabin,
        cabinName,
        baggage: { checked: 0, cabin: 0 },
        fareBasis: '',
      },
    ];

    const itineraries: any[] = [
      {
        duration: this.minutesToIso(durationToMinutes),
        segments: outboundSegments,
        fareBrandName: '',
        stopCount: transfers,
        layovers: [],
      },
    ];

    if (offer.return_at) {
      const returnDepartureAt = offer.return_at || '';
      const returnArrivalAt = this.addMinutesToDateStr(
        returnDepartureAt,
        durationBackMinutes,
      );

      const returnSegments = [
        {
          carrierCode: offer.airline || '??',
          number: offer.return_flight_number || '',
          departure: {
            iataCode: String(offer.destination || '???').toUpperCase(),
            at: returnDepartureAt,
            terminal: null,
            cityName: String(offer.destination || ''),
            airport: String(offer.destination || ''),
          },
          arrival: {
            iataCode: String(offer.origin || '???').toUpperCase(),
            at: returnArrivalAt,
            terminal: null,
            cityName: String(offer.origin || ''),
            airport: String(offer.origin || ''),
          },
          duration: this.minutesToIso(durationBackMinutes),
          stopCount: returnTransfers,
          aircraft: { code: '', name: 'Aircraft' },
          operatingCarrier: {
            name: offer.airline || '',
            code: offer.airline || '',
          },
          marketingCarrier: {
            name: offer.airline || '',
            code: offer.airline || '',
          },
          cabin,
          cabinName,
          baggage: { checked: 0, cabin: 0 },
          fareBasis: '',
        },
      ];

      itineraries.push({
        duration: this.minutesToIso(durationBackMinutes),
        segments: returnSegments,
        fareBrandName: '',
        stopCount: returnTransfers,
        layovers: [],
      });
    }

    return {
      id: this.generateTravelpayoutsId(offer),
      price,
      priceBreakdown,
      passengerFares,       // ✅
      paxWisePricing,       // ✅
      itineraries,
      conditions: {
        refundable: false,
        changeable: false,
        refundPenalty: null,
        changePenalty: null,
        penaltyCurrency: sourceCurrency,
      },
      baggageInfo: {
        checked: 'Not Included',
        cabin: 'Not Included',
        checkedRaw: 0,
        cabinRaw: 0,
      },
      provider: 'travelpayouts',
      _travelpayouts: {
        airline: offer.airline || '',
        flightNumber: offer.flight_number || '',
        returnFlightNumber: offer.return_flight_number || '',
        link: offer.link || '',
        transfers,
        returnTransfers,
        durationTo: durationToMinutes,
        durationBack: durationBackMinutes,
        departureAt: offer.departure_at || '',
        returnAt: offer.return_at || '',
        origin: offer.origin || '',
        destination: offer.destination || '',
        expiresAt: offer.expires_at || '',
        rawOffer: offer,
      },
    };
  }

  normalizeTravelpayoutsOffers(
    offers: any[],
    searchParams?: {
      adults?: number;
      children?: number;
      infants?: number;
      cabinClass?: string;
    },
  ): NormalizedFlight[] {
    return offers.map((offer) =>
      this.normalizeTravelpayoutsOffer(offer, searchParams),
    );
  }

  // ==================== PAX FARE EXTRACTION HELPERS ====================

  /**
   * ✅ Extract per-passenger pricing from Amadeus travelerPricings
   * Amadeus directly provides each pax type's actual fare
   */
  private extractAmadeusPaxFares(
    travelerPricings: any[],
    fallbackCurrency: string,
  ): PassengerFare[] {
    if (!Array.isArray(travelerPricings) || travelerPricings.length === 0) {
      return [];
    }

    // Group by traveler type
    const byType: Record<string, any[]> = {};
    travelerPricings.forEach((tp) => {
      const type = tp.travelerType || 'ADULT';
      if (!byType[type]) byType[type] = [];
      byType[type].push(tp);
    });

    const fares: PassengerFare[] = [];

    for (const type of Object.keys(byType)) {
      const group = byType[type];
      const first = group[0];

      const baseFare = this.toNum(first?.price?.base || 0);
      const totalFare = this.toNum(first?.price?.total || 0);
      const taxAmount = Math.max(0, totalFare - baseFare);
      const count = group.length;

      fares.push({
        travelerId: first.travelerId,
        travelerType: type,
        baseFare: this.round2(baseFare),
        taxAmount: this.round2(taxAmount),
        totalFare: this.round2(totalFare),
        count,
        subtotal: this.round2(totalFare * count),
        currency: first?.price?.currency || fallbackCurrency,
      });
    }

    return fares;
  }

  /**
   * ✅ Extract per-passenger pricing from Duffel
   * Duffel passengers array contains pax types
   */
  private extractDuffelPaxFares(
    offer: any,
    duffelPassengers: any[],
  ): PassengerFare[] {
    if (!Array.isArray(duffelPassengers) || duffelPassengers.length === 0) {
      return [];
    }

    const total = this.toNum(offer.total_amount || 0);
    const base = this.toNum(offer.base_amount || total);
    const tax = Math.max(0, total - base);
    const currency = offer.total_currency || 'USD';

    // Standard ratios for Duffel (since Duffel doesn't give per-pax breakdown)
    const ratios: Record<string, number> = {
      adult: 1.0,
      child: 0.75,
      infant_without_seat: 0.1,
      infant_with_seat: 0.75,
    };

    // Count by type
    const countByType: Record<string, number> = {};
    duffelPassengers.forEach((p) => {
      const type = p.type || 'adult';
      countByType[type] = (countByType[type] || 0) + 1;
    });

    // Calculate weighted total
    let weightedTotal = 0;
    for (const type of Object.keys(countByType)) {
      weightedTotal += (ratios[type] || 1.0) * countByType[type];
    }

    const baseAdult = weightedTotal > 0 ? base / weightedTotal : base;
    const taxAdult = weightedTotal > 0 ? tax / weightedTotal : tax;

    const fares: PassengerFare[] = [];
    for (const type of Object.keys(countByType)) {
      const ratio = ratios[type] || 1.0;
      const count = countByType[type];

      const baseFare = this.round2(baseAdult * ratio);
      const taxAmount = this.round2(taxAdult * ratio);
      const totalFare = this.round2(baseFare + taxAmount);

      // Map Duffel type → standard type
      const mappedType =
        type === 'adult'
          ? 'ADULT'
          : type === 'child'
            ? 'CHILD'
            : 'HELD_INFANT';

      fares.push({
        travelerType: mappedType,
        baseFare,
        taxAmount,
        totalFare,
        count,
        subtotal: this.round2(totalFare * count),
        currency,
      });
    }

    return fares;
  }

  /**
   * ✅ Estimate per-pax fares for Travelpayouts (no breakdown available)
   * Uses standard airline ratios: Adult 100%, Child 75%, Infant 10%
   */
  private estimateTravelpayoutsPaxFares(
    totalFare: number,
    currency: string,
    searchParams?: {
      adults?: number;
      children?: number;
      infants?: number;
    },
  ): PassengerFare[] {
    const adults = Math.max(1, searchParams?.adults || 1);
    const children = Math.max(0, searchParams?.children || 0);
    const infants = Math.max(0, searchParams?.infants || 0);

    const adultRatio = 1.0;
    const childRatio = 0.75;
    const infantRatio = 0.1;

    const weightedTotal =
      adults * adultRatio + children * childRatio + infants * infantRatio;

    const adultFare = weightedTotal > 0 ? totalFare / weightedTotal : totalFare;

    const fares: PassengerFare[] = [];

    if (adults > 0) {
      const baseFare = this.round2(adultFare * adultRatio);
      fares.push({
        travelerType: 'ADULT',
        baseFare,
        taxAmount: 0,
        totalFare: baseFare,
        count: adults,
        subtotal: this.round2(baseFare * adults),
        currency,
      });
    }

    if (children > 0) {
      const baseFare = this.round2(adultFare * childRatio);
      fares.push({
        travelerType: 'CHILD',
        baseFare,
        taxAmount: 0,
        totalFare: baseFare,
        count: children,
        subtotal: this.round2(baseFare * children),
        currency,
      });
    }

    if (infants > 0) {
      const baseFare = this.round2(adultFare * infantRatio);
      fares.push({
        travelerType: 'HELD_INFANT',
        baseFare,
        taxAmount: 0,
        totalFare: baseFare,
        count: infants,
        subtotal: this.round2(baseFare * infants),
        currency,
      });
    }

    return fares;
  }

  /**
   * ✅ Build pax-wise pricing summary from passenger fares
   */
  private buildPaxWisePricing(passengerFares: PassengerFare[]): PaxWisePricing {
    const adult = passengerFares.find((p) => p.travelerType === 'ADULT');
    const child = passengerFares.find((p) => p.travelerType === 'CHILD');
    const infant = passengerFares.find(
      (p) =>
        p.travelerType === 'HELD_INFANT' ||
        p.travelerType === 'SEATED_INFANT',
    );

    return {
      adult: adult || null,
      child: child || null,
      infant: infant || null,
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  // ===========HELPER FOR TRAVELPAYOUT ID==================

  private generateTravelpayoutsId(offer: any): string {
    const airline = String(offer?.airline || 'XX').toUpperCase();
    const origin = String(offer?.origin || 'ORG').toUpperCase();
    const destination = String(offer?.destination || 'DST').toUpperCase();
    const flightNo = String(offer?.flight_number || '000');

    const dateStr = String(offer?.departure_at || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 14);

    const price = String(offer?.price || '0');

    return `TP-${airline}${flightNo}-${origin}${destination}-${dateStr}-${price}`;
  }
}