// src/modules/flights/types/flight.types.ts

export interface FlightSegment {
  carrierCode: string;
  number: string;
  departure: {
    iataCode: string;
    at: string;
    terminal?: string | null;
    cityName?: string;
    airport?: string;
  };
  arrival: {
    iataCode: string;
    at: string;
    terminal?: string | null;
    cityName?: string;
    airport?: string;
  };
  duration: string;
  stopCount?: number;
  aircraft?: { code: string; name: string };
  operatingCarrier?: { name: string; code: string };
  marketingCarrier?: { name: string; code: string };
  cabin?: string;
  cabinName?: string;
  baggage?: { checked: number; cabin: number };
  fareBasis?: string;
}

export interface FlightItinerary {
  duration: string;
  segments: FlightSegment[];
  fareBrandName?: string;
  stopCount?: number;
  layovers?: Array<{
    airport: string;
    cityName: string;
    duration: string;
  }>;
}

export interface AgentUiFare {
  baseFare: number;
  taxAmount: number;
  totalBaseTax: number;
  customerInvoiceTotal: number;
  discountOrCommission: number;
  grandTotal: number;
  perPerson: number;
  currency: string;
  adults: number;
  children: number;
  infants: number;
  totalPax: number;
}

export interface AdminFare {
  supplierFare: number;
  publishedFare: number;
  offeredFare: number;
  markup: number;
  serviceFee: number;
  convenienceFee: number;
  transactionFee: number;
  agentDiscount: number;
  promoDiscount: number;
  commission: number;
  ait: number;
  vat: number;
  roundOff: number;
  paymentGatewayFee: number;
  netPayableToSupplier: number;
  netReceivableFromAgent: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
}

export interface PriceBreakdown {
  baseFare: number;
  taxAmount: number;
  customerInvoiceTotal: number;
  discount: number;
  grandTotal: number;
  perPerson: number;
  currency: string;
  adults: number;
  children: number;
  infants: number;
  totalPax: number;
  agentUi: AgentUiFare;
  admin: AdminFare;
  markup: any | null;
  meta: {
    commissionType: 'flat' | 'percent';
    commissionMode: string;
    commissionOn: string;
    aitOn: string;
    source: string;
  };
}

// ✅ NEW: Per-passenger fare type
export interface PassengerFare {
  travelerId?: string;
  travelerType: 'ADULT' | 'CHILD' | 'HELD_INFANT' | 'SEATED_INFANT' | string;
  baseFare: number;       // Per pax base fare
  taxAmount: number;      // Per pax tax
  totalFare: number;      // Per pax total (base + tax)
  count: number;          // How many of this type
  subtotal: number;       // totalFare × count
  currency: string;
}

// ✅ NEW: Pax-wise pricing summary
export interface PaxWisePricing {
  adult?: PassengerFare | null;
  child?: PassengerFare | null;
  infant?: PassengerFare | null;
}

export interface NormalizedFlight {
  id: string;

  price: {
    total: string;
    grandTotal: string;
    base: string;
    tax: string;
    markup?: string;
    ait?: string;
    currency: string;
  };

  priceBreakdown: PriceBreakdown;

  // ✅ Per-passenger pricing details
  passengerFares?: PassengerFare[];
  paxWisePricing?: PaxWisePricing;

  itineraries: FlightItinerary[];

  conditions: {
    refundable: boolean;
    changeable: boolean;
    refundPenalty?: string | null;
    changePenalty?: string | null;
    penaltyCurrency?: string;
  };

  baggageInfo: {
    checked: string;
    cabin: string;
    checkedRaw: number;
    cabinRaw: number;
  };

  discountInfo?: {
    discounts: any[];
    totalDiscount: number;
    hasPromo: boolean;
    labels: string[];
  };

  // ✅ Duffel API specific data
  _duffel?: {
    owner: string;
    ownerCode: string;
    ownerLogo: string;
    passengers: any[];
    paymentRequirements: any;
    expiresAt: string;
    totalEmissions: number | null;
    rawOffer?: any;
  };

  // ✅ Travelpayouts API specific data
  _travelpayouts?: {
    airline: string;
    flightNumber: string;
    returnFlightNumber?: string;
    link: string;
    transfers: number;
    returnTransfers: number;
    durationTo: number;
    durationBack: number;
    departureAt?: string;
    returnAt?: string;
    origin?: string;
    destination?: string;
    expiresAt: string;
    rawOffer?: any;
  };

  // ✅ Amadeus API specific data
  _amadeus?: {
    lastTicketingDate?: string;
    lastTicketingDateTime?: string;
    numberOfBookableSeats?: number;
    oneWay?: boolean;
    instantTicketingRequired?: boolean;
    validatingAirlineCodes?: string[];
    carrierCode?: string;
    rawOffer?: any;
  };

  provider?: 'duffel' | 'amadeus' | 'travelpayouts';
}

export interface SearchSlice {
  origin: string;
  destination: string;
  departure_date: string;
}

export interface FlightSearchParams {
  tripType: 'ONE_WAY' | 'ROUND_TRIP' | 'MULTI_CITY';
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string | null;
  cabinClass: string;
  adults: number;
  children: number;
  infants: number;
  slices: SearchSlice[];
  provider?: 'duffel' | 'amadeus' | 'travelpayouts' | 'all';

  agentId?: string;
  agentTier?: string;
}

export interface MarkupRule {
  id: string;
  type: string;
  airlineCode?: string | null;
  origin?: string | null;
  destination?: string | null;
  routeMatchType?: string;
  agentId?: string | null;
  markupAmount: number;
  markupPercent: number;
  markupOn: 'BASE_FARE' | 'TOTAL';
  markupCurrency?: string | null;
  priority?: number;
  isActive?: boolean;
  validFrom?: Date | string | null;
  validTo?: Date | string | null;
  deletedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface MarkupContext {
  airlineCode?: string;
  origin?: string;
  destination?: string;
  agentId?: string;
}

export interface DiscountContext {
  airlineCode?: string;
  origin?: string;
  destination?: string;
  cabinClass?: string;
  agentId?: string;
  agentTier?: string;
  promoCode?: string;
  fareAmount: number;
  baseFare: number;
  currency: string;
}

export interface DiscountResult {
  discounts: any[];
  totalDiscount: number;
  hasPromo: boolean;
  labels: string[];
}

export interface OtaPricingConfig {
  markup?: number;
  serviceFee?: number;
  convenienceFee?: number;
  transactionFee?: number;
  paymentGatewayFee?: number;
  agentDiscount?: number;
  promoDiscount?: number;
  commissionValue?: number;
  commissionType?: 'flat' | 'percent';
  commissionOn?: 'base' | 'supplier_total';
  commissionMode?: 'deduct_from_agent_payable' | 'internal_only';
  aitRate?: number;
  aitOn?: 'supplier' | 'selling';
  vatRate?: number;
  roundOff?: number;
}