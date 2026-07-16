import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { computeBookingPayment } from 'src/common/lib/accounting';
import { AmadeusService } from 'src/modules/flights/services/providers/amadeus.service';
import { DuffelService } from 'src/modules/flights/services/providers/duffel.service';
import { TravelpayoutsService } from 'src/modules/flights/services/providers/travelpayouts.service';

@Injectable()
export class AgentBookingService {
  private readonly logger = new Logger(AgentBookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amadeusService: AmadeusService,
    private readonly duffelService: DuffelService,
    private readonly travelpayoutsService: TravelpayoutsService,
  ) {}

  // ──────────────────────────────────────────────
  // GET ALL BOOKINGS
  // ──────────────────────────────────────────────
  async getAllBookings(agentId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { agentId },
      include: {
        agent: true,
        passengers: true,
        segments: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => ({
      id: b.id,
      bookingId: b.bookingId,
      status: b.status,
      agent: {
        agentName: b.agent?.agentName || '',
        agentId: b.agent?.agentId || '',
      },
      tripType: b.tripType,
      pnr: b.pnr,
      airlinePnr: b.airlinePnr,
      supplier: b.supplier,
      carrier: b.carrier,
      route: b.route,
      departureDate: b.departureDate,
      bookingDate: b.bookingDate,
      issuedBy: b.issuedBy || '',
      passengers: b.passengers.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
      })),
      net: Number(b.net || 0),
      gross: Number(b.gross || 0),
    }));
  }

  // ──────────────────────────────────────────────
  // GET SINGLE BOOKING BY ID
  // ──────────────────────────────────────────────
  async getBookingById(agentId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, agentId },
      include: {
        agent: {
          select: {
            id: true,
            agentId: true,
            agentName: true,
            agentAddress: true,
            email: true,
            phone: true,
            balance: true,
            creditLimit: true,
            usedLimit: true,
            firstName: true,
            lastName: true,
          },
        },
        passengers: true,
        segments: true,
        payments: true,
        requests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const processedIds = [
      ...new Set(
        booking.requests
          .map((r) => r.processedBy)
          .filter((id): id is string => !!id),
      ),
    ];

    const reviewers = processedIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: processedIds } },
          select: {
            id: true,
            role: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        })
      : [];

    const reviewerMap = new Map(
      reviewers.map((u) => {
        const displayName =
          `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
          u.email ||
          u.id;
        return [u.id, displayName];
      }),
    );

    return {
      id: booking.id,
      bookingId: booking.bookingId,
      status: booking.status,
      tripType: booking.tripType,
      route: booking.route,
      departureDate: booking.departureDate,
      returnDate: booking.returnDate,
      pnr: booking.pnr,
      airlinePnr: booking.airlinePnr,
      supplier: booking.supplier,
      supplierOrderId: booking.supplierOrderId,
      carrier: booking.carrier,
      currency: booking.currency,
      cabinClass: booking.cabinClass,
      baggageInfo: booking.baggageInfo,
      conditions: booking.conditions,
      remarks: booking.remarks,
      bookingDate: booking.bookingDate,
      createdAt: booking.createdAt,
      net: Number(booking.net || 0),
      gross: Number(booking.gross || 0),
      commission: Number(booking.commission || 0),
      priceBreakdown: booking.priceBreakdown,

      agent: booking.agent
        ? {
            id: booking.agent.id,
            agentId: booking.agent.agentId,
            agentName: booking.agent.agentName,
            agentAddress: booking.agent.agentAddress,
            email: booking.agent.email,
            phone: booking.agent.phone,
            balance: Number(booking.agent.balance || 0),
            creditLimit: Number(booking.agent.creditLimit || 0),
            usedLimit: Number(booking.agent.usedLimit || 0),
            firstName: booking.agent.firstName,
            lastName: booking.agent.lastName,
          }
        : null,

      passengers: booking.passengers.map((p) => ({
        id: p.id,
        title: p.title,
        firstName: p.firstName,
        lastName: p.lastName,
        type: p.type,
        gender: p.gender,
        dateOfBirth: p.dateOfBirth,
        nationality: p.nationality,
        passportNumber: p.passportNumber,
        passportExpiry: p.passportExpiry,
        email: p.email,
        phone: p.phone,
      })),

      segments: booking.segments.map((s) => ({
        id: s.id,
        from: s.from,
        to: s.to,
        departure: s.departure,
        arrival: s.arrival,
        flightNo: s.flightNo,
        airline: s.airline,
      })),

      requests: booking.requests.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        remarks: r.remarks,
        adminNote: r.adminNote,
        processedBy: r.processedBy
          ? reviewerMap.get(r.processedBy) || r.processedBy
          : null,
        processedAt: r.processedAt,
        gdsPnr: r.gdsPnr,
        ticketNumber: r.ticketNumber,
        supplierName: r.supplierName,
        issueAmount: r.issueAmount ? Number(r.issueAmount) : null,
        createdAt: r.createdAt,
      })),

      payments: booking.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount || 0),
        currency: p.currency,
        method: p.method,
        status: p.status,
        paidAt: p.paidAt,
      })),
    };
  }

  // ──────────────────────────────────────────────
  // SUBMIT BOOKING REQUEST (Issue / Cancel / Void)
  // Issue Request দিলে Balance/Credit Deduct হবে (PENDING status)
  // Admin approve করলে → TICKET (COMPLETED) হবে
  // ──────────────────────────────────────────────
  async submitRequest(
    agentId: string,
    body: {
      bookingId: string;
      type: string;
      remarks?: string;
    },
  ) {
    const { bookingId, type, remarks } = body;

    if (!bookingId) throw new BadRequestException('Booking ID is required');
    if (!type) throw new BadRequestException('Request type is required');

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, agentId },
      include: { passengers: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    const existing = await this.prisma.bookingRequest.findFirst({
      where: {
        bookingId,
        type: type as any,
        status: 'PENDING',
      },
    });

    if (existing) {
      throw new BadRequestException(`A ${type} request is already pending`);
    }

    // ══════════════════════════════════════════
    // ISSUE REQUEST → Balance/Credit Deduct (PENDING)
    // ══════════════════════════════════════════
    if (type === 'ISSUE') {
      const fare = Number(booking.net || 0);

      if (fare <= 0) {
        throw new BadRequestException('Invalid booking fare for issue');
      }

      const result = await this.prisma.$transaction(
        async (tx) => {
          const agent = await tx.user.findUnique({
            where: { id: agentId },
            select: {
              id: true,
              agentName: true,
              balance: true,
              creditLimit: true,
              usedLimit: true,
              firstName: true,
              lastName: true,
            },
          });

          if (!agent) throw new NotFoundException('Agent account not found');

          let payment: ReturnType<typeof computeBookingPayment>;
          try {
            payment = computeBookingPayment({
              balance: agent.balance,
              creditLimit: agent.creditLimit,
              usedLimit: agent.usedLimit,
              fare,
            });
          } catch (err: any) {
            if (err?.message === 'INSUFFICIENT_BALANCE') {
              throw new BadRequestException('INSUFFICIENT_BALANCE');
            }
            throw err;
          }

          // Deduct balance/credit (held until admin approves)
          const updatedAgent = await tx.user.update({
            where: { id: agentId },
            data: {
              balance: payment.newBalance,
              usedLimit: payment.newUsedLimit,
            },
            select: {
              balance: true,
              usedLimit: true,
            },
          });

          await tx.booking.update({
            where: { id: bookingId },
            data: {
              remarks:
                payment.fromCredit > 0
                  ? `Payment: ${payment.fromBalance > 0 ? `Balance ${payment.fromBalance} + ` : ''}Credit ${payment.fromCredit} ${booking.currency || 'SAR'}`
                  : `Payment: Balance ${payment.fromBalance} ${booking.currency || 'SAR'}`,
            },
          });

          const passengerNames = booking.passengers
            .map((p) => `${p.firstName} ${p.lastName}`)
            .join(', ');

          const totalDebit =
            Number(payment.fromBalance || 0) +
            Number(payment.fromCredit || 0);

          const ledgerBalanceAfter =
            Number(updatedAgent.balance || 0) -
            Number(updatedAgent.usedLimit || 0);

          // ✅ Issue Request Ledger Entry (PENDING - awaiting admin approval)
          await tx.agentLedger.create({
            data: {
              userId: agentId,
              type: 'TICKET_REQUESTED', // ✅ Pending - not yet issued
              sourceType: 'BOOKING',
              sourceId: booking.id,
              bookingId: booking.id,
              invoiceNo: `INV-${booking.bookingId}`,
              debit: totalDebit,
              credit: 0,
              balanceAfter: ledgerBalanceAfter,
              currency: booking.currency || 'SAR',
              pnr: booking.pnr,
              reference: booking.bookingId,
              description: `Issue Request | ${booking.route} | PNR: ${booking.pnr} | ${booking.carrier} | Pax: ${passengerNames} | Payment: Balance ${payment.fromBalance} + Credit ${payment.fromCredit}`,
              status: 'PENDING', // ✅ Pending until admin approves
              createdBy: agent.agentName || agentId,
            },
          });

          await tx.payment.create({
            data: {
              bookingId: booking.id,
              userId: agentId,
              amount: fare,
              currency: booking.currency || 'SAR',
              method: 'MANUAL',
              status: 'SUCCESS',
              paidAt: new Date(),
              transactionId: `ISS-${booking.bookingId}`,
            },
          });

          const request = await tx.bookingRequest.create({
            data: {
              bookingId,
              agentId,
              type: type as any,
              status: 'PENDING',
              remarks: remarks || null,
            },
          });

          return { request, payment };
        },
        { timeout: 10000 },
      );

      // ── Notification ──
      try {
        const admins = await this.prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] } },
          select: { id: true },
        });

        if (admins.length > 0) {
          await this.prisma.notification.createMany({
            data: admins.map((admin) => ({
              userId: admin.id,
              type: 'request',
              title: '📩 Issue Request',
              message: `Issue request for ${booking.bookingId} | PNR: ${booking.pnr} | Amount: ${fare} ${booking.currency || 'SAR'} deducted (pending approval)`,
              action: '/admin/bookings/requests',
              read: false,
            })),
          });
        }
      } catch (notifyError: any) {
        this.logger.warn(
          `Issue request notification failed: ${notifyError?.message}`,
        );
      }

      this.logger.log(
        `Issue Request created | Booking: ${bookingId} | Agent: ${agentId} | Amount: ${fare} (pending approval)`,
      );

      return {
        success: true,
        requestId: result.request.id,
        deducted: {
          fromBalance: result.payment.fromBalance,
          fromCredit: result.payment.fromCredit,
          total: result.payment.fare,
        },
        message: `Issue request submitted | ${fare} ${booking.currency || 'SAR'} held pending admin approval`,
      };
    }

    // ══════════════════════════════════════════
    // CANCEL / VOID / REISSUE / REFUND (no deduction yet)
    // ══════════════════════════════════════════
    const request = await this.prisma.bookingRequest.create({
      data: {
        bookingId,
        agentId,
        type: type as any,
        status: 'PENDING',
        remarks: remarks || null,
      },
    });

    this.logger.log(
      `Request created | Type: ${type} | Booking: ${bookingId} | Agent: ${agentId}`,
    );

    return {
      success: true,
      requestId: request.id,
      message: `${type} request submitted successfully`,
    };
  }

  // ──────────────────────────────────────────────
  // CREATE BOOKING — Multi-GDS Ready (Amadeus + Duffel)
  // ──────────────────────────────────────────────
  async createBooking(agentId: string, body: any) {
    let supplierOrderId: string | null = null;
    let supplier: string = 'AMADEUS';

    try {
      const {
        flightOffer,
        passengers,
        contact,
        tripType,
        checkedBag,
        cabinBag,
        checkedBagRaw,
        cabinBagRaw,
        refundable,
        changeable,
        refundPenalty,
        changePenalty,
        cabinClass,
        netFare,
        baseFare,
        currency: frontendCurrency,
      } = body;

      // ── Input Validation ──
      if (!agentId) throw new BadRequestException('Agent ID is missing');
      if (!flightOffer)
        throw new BadRequestException('flightOffer is required');
      if (!Array.isArray(passengers) || passengers.length === 0)
        throw new BadRequestException('Passengers are required');
      if (!tripType) throw new BadRequestException('tripType is required');

      // ══════════════════════════════════════════
      // MULTI-GDS PROVIDER ROUTING
      // ══════════════════════════════════════════
      const provider = flightOffer?.provider;

      if (provider === 'travelpayouts') {
        throw new BadRequestException(
          'Travelpayouts bookings require redirect to affiliate. Direct booking not supported.',
        );
      }

      if (!['amadeus', 'duffel'].includes(provider)) {
        throw new BadRequestException(
          `Booking not supported for provider: ${provider}. Supported: Amadeus, Duffel.`,
        );
      }

      supplier = provider.toUpperCase(); // "AMADEUS" | "DUFFEL"

      // Get provider service & raw offer dynamically
      let providerService: AmadeusService | DuffelService;
      let rawOffer: any;

      if (provider === 'amadeus') {
        providerService = this.amadeusService;
        rawOffer = flightOffer?._amadeus?.rawOffer;

        if (!rawOffer?.type || rawOffer.type !== 'flight-offer') {
          throw new BadRequestException(
            'Invalid Amadeus flight offer. Please search again.',
          );
        }
      } else {
        // duffel
        providerService = this.duffelService;
        rawOffer = flightOffer?._duffel?.rawOffer;

        if (!rawOffer?.id) {
          throw new BadRequestException(
            'Invalid Duffel flight offer. Please search again.',
          );
        }
      }

      this.logger.log(`Provider: ${supplier}`);

      // ══════════════════════════════════════════
      // STEP 1: Provider Price Confirm
      // ══════════════════════════════════════════
      this.logger.log(`Confirming flight price with ${supplier}...`);

      const pricing = await providerService.confirmPrice(rawOffer);

      if (!pricing.ok || !pricing.data?.flightOffers?.length) {
        const errorMsg =
          pricing.error?.message || 'Flight price confirmation failed';
        throw new BadRequestException(errorMsg);
      }

      const pricedOffer = pricing.data.flightOffers[0];

      // ══════════════════════════════════════════
      // PRICE HANDLING — Universal for all providers
      // ══════════════════════════════════════════
      let providerRawFare = 0;
      let providerRawCurrency = 'USD';

      if (provider === 'amadeus') {
        providerRawFare = Number(pricedOffer?.price?.grandTotal || 0);
        providerRawCurrency = pricedOffer?.price?.currency || 'USD';
      } else if (provider === 'duffel') {
        providerRawFare = Number(pricedOffer?.total_amount || 0);
        providerRawCurrency = pricedOffer?.total_currency || 'USD';
      }

      // Frontend converted price (actual deduct)
      const fare = Number(netFare || 0);
      const currency = frontendCurrency || 'SAR';

      if (!fare || fare <= 0) {
        throw new BadRequestException('Invalid fare amount from frontend');
      }

      this.logger.log(`Agent Pays: ${fare} ${currency}`);

      // ══════════════════════════════════════════
      // Extract route info (Universal)
      // ══════════════════════════════════════════
      let origin = '';
      let destination = '';
      let departure = '';
      let arrival = '';
      let carrier = 'N/A';
      let segmentsData: any[] = [];

      if (provider === 'amadeus') {
        const firstItinerary = pricedOffer?.itineraries?.[0];
        const firstSegment = firstItinerary?.segments?.[0];
        const lastSegment =
          firstItinerary?.segments?.[firstItinerary.segments.length - 1];

        origin = firstSegment?.departure?.iataCode;
        destination = lastSegment?.arrival?.iataCode;
        departure = firstSegment?.departure?.at;
        arrival = lastSegment?.arrival?.at;
        carrier = firstSegment?.carrierCode || 'N/A';

        segmentsData =
          firstItinerary?.segments?.map((s: any) => ({
            from: s.departure?.iataCode,
            to: s.arrival?.iataCode,
            departure: new Date(s.departure?.at),
            arrival: new Date(s.arrival?.at),
            flightNo: `${s.carrierCode}${s.number}`,
            airline: s.carrierCode,
          })) || [];
      } else if (provider === 'duffel') {
        const firstSlice = pricedOffer?.slices?.[0];
        const firstSegment = firstSlice?.segments?.[0];
        const lastSegment =
          firstSlice?.segments?.[firstSlice.segments.length - 1];

        origin = firstSegment?.origin?.iata_code;
        destination = lastSegment?.destination?.iata_code;
        departure = firstSegment?.departing_at;
        arrival = lastSegment?.arriving_at;
        carrier =
          firstSegment?.marketing_carrier?.iata_code ||
          firstSegment?.operating_carrier?.iata_code ||
          'N/A';

        segmentsData =
          firstSlice?.segments?.map((s: any) => ({
            from: s.origin?.iata_code,
            to: s.destination?.iata_code,
            departure: new Date(s.departing_at),
            arrival: new Date(s.arriving_at),
            flightNo: `${s.marketing_carrier?.iata_code}${s.marketing_carrier_flight_number}`,
            airline: s.marketing_carrier?.iata_code,
          })) || [];
      }

      if (!origin || !destination || !departure) {
        throw new BadRequestException('Invalid flight offer structure');
      }

      // ══════════════════════════════════════════
      // STEP 2: Agent Balance/Credit CHECK ONLY
      // ══════════════════════════════════════════
      const agent = await this.prisma.user.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          agentName: true,
          balance: true,
          creditLimit: true,
          usedLimit: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!agent) throw new NotFoundException('Agent account not found');

      const availableBalance = Number(agent.balance || 0);
      const availableCredit =
        Number(agent.creditLimit || 0) - Number(agent.usedLimit || 0);
      const totalAvailable = availableBalance + availableCredit;

      if (totalAvailable < fare) {
        throw new BadRequestException('INSUFFICIENT_BALANCE');
      }

      const issuedByName =
        agent.agentName ||
        `${agent.firstName || ''} ${agent.lastName || ''}`.trim() ||
        'Unknown';

      const agentDisplayName =
        agent.agentName?.trim() ||
        `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim() ||
        'Agent';

      // ══════════════════════════════════════════
      // STEP 3: Provider Real Order Create → Real PNR
      // ══════════════════════════════════════════
      this.logger.log(`Creating real ${supplier} order...`);

      const travelers = this.toAmadeusTravelers(passengers);
      const contacts = this.toAmadeusContacts(passengers, contact);

      const orderRes = await providerService.createOrder(
        pricedOffer,
        travelers,
        contacts,
      );

      if (!orderRes.ok || !orderRes.order) {
        const errorMsg =
          orderRes.error?.message || `${supplier} order creation failed`;

        if (
          errorMsg.includes('sell segment') ||
          errorMsg.includes('SEGMENT') ||
          errorMsg.includes('unavailable')
        ) {
          throw new BadRequestException(
            'This flight is no longer available. Please search again with fresh offers.',
          );
        }

        throw new BadRequestException(errorMsg);
      }

      supplierOrderId = orderRes.order?.id || null;

      // Extract PNRs (Universal)
      const associatedRecords = orderRes.order?.associatedRecords || [];

      const gdsPnr =
        associatedRecords.find((r: any) => r.originSystemCode === 'GDS')
          ?.reference ||
        associatedRecords[0]?.reference ||
        null;

      const airlinePnr =
        associatedRecords.find(
          (r: any) =>
            r.originSystemCode &&
            r.originSystemCode !== 'GDS' &&
            r.reference !== gdsPnr,
        )?.reference || null;

      if (!gdsPnr) {
        throw new BadRequestException('PNR not returned from supplier');
      }

      this.logger.log(`GDS PNR: ${gdsPnr} | Supplier: ${supplier}`);

      const bookingId = `MBK${Date.now()}`;

      // ══════════════════════════════════════════
      // STEP 4: DB Save — Converted Price
      // ══════════════════════════════════════════
      const result = await this.prisma.$transaction(
        async (tx) => {
          const booking = await tx.booking.create({
            data: {
              bookingId,
              pnr: gdsPnr,
              airlinePnr: airlinePnr,
              supplier: supplier,
              supplierOrderId: supplierOrderId,

              // Audit: Both prices saved
              supplierData: {
                rawOrder: orderRes.order,
                pricing: {
                  provider: {
                    amount: providerRawFare,
                    currency: providerRawCurrency,
                    name: supplier,
                  },
                  agent: {
                    amount: fare,
                    currency: currency,
                  },
                  exchangeRate:
                    providerRawFare > 0
                      ? Math.round((fare / providerRawFare) * 10000) / 10000
                      : 1,
                },
              },

              status: 'ON_HOLD',
              tripType: tripType as any,
              route: `${origin}-${destination}`,
              departureDate: new Date(departure),
              returnDate: arrival ? new Date(arrival) : null,
              issuedBy: issuedByName,
              carrier,
              agentId,

              net: fare,
              gross: fare,
              commission: 0,
              currency: currency,

              cabinClass: cabinClass || 'Economy',
              baggageInfo: {
                checked: checkedBag || 'Not Included',
                cabin: cabinBag || 'Not Included',
                checkedRaw: parseInt(checkedBagRaw || '0'),
                cabinRaw: parseInt(cabinBagRaw || '0'),
              },
              conditions: {
                refundable: refundable === 'true' || refundable === true,
                changeable: changeable === 'true' || changeable === true,
                refundPenalty: refundPenalty || null,
                changePenalty: changePenalty || null,
              },
              remarks: `${supplier} Order: ${supplierOrderId}`,
              priceBreakdown:
                pricedOffer?.price ||
                (pricedOffer?.total_amount
                  ? {
                      total: pricedOffer.total_amount,
                      base: pricedOffer.base_amount,
                      currency: pricedOffer.total_currency,
                    }
                  : null),

              passengers: {
                create: passengers.map((p: any) => ({
                  title: p.title as any,
                  firstName: p.firstName,
                  lastName: p.lastName,
                  type: p.type as any,
                  gender: p.gender as any,
                  dateOfBirth: p.dateOfBirth
                    ? new Date(p.dateOfBirth)
                    : null,
                  nationality: p.nationality,
                  passportNumber: p.passportNumber || null,
                  passportExpiry: p.passportExpiry
                    ? new Date(p.passportExpiry)
                    : null,
                  email: p.email || null,
                  phone: p.phone || null,
                })),
              },

              segments: {
                create: segmentsData,
              },
            },
          });

          return {
            booking,
            agentInfo: {
              id: agent.id,
              name: agentDisplayName,
            },
          };
        },
        { timeout: 10000 },
      );

      // ══════════════════════════════════════════
      // NOTIFICATION
      // ══════════════════════════════════════════
      try {
        await this.prisma.notification.create({
          data: {
            userId: result.agentInfo.id,
            type: 'booking',
            title: '🎫 Booking Created',
            message: `Booking ${result.booking.bookingId} | PNR: ${result.booking.pnr} | ${result.booking.route ?? 'N/A'}`,
            action: `/user/bookings/${result.booking.id}`,
            read: false,
          },
        });

        const admins = await this.prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'MANAGER'] } },
          select: { id: true },
        });

        if (admins.length > 0) {
          await this.prisma.notification.createMany({
            data: admins.map((admin) => ({
              userId: admin.id,
              type: 'booking',
              title: '🎫 New Booking',
              message: `${result.agentInfo.name} created booking ${result.booking.bookingId} | PNR: ${result.booking.pnr} | ${result.booking.route ?? 'N/A'}`,
              action: '/admin/bookings/on-hold',
              read: false,
            })),
          });
        }
      } catch (notifyError: any) {
        this.logger.warn(
          `Booking created but notification failed: ${notifyError?.message}`,
        );
      }

      return {
        success: true,
        id: result.booking.id,
        bookingId: result.booking.bookingId,
        pnr: result.booking.pnr,
        airlinePnr: result.booking.airlinePnr,
        supplier: result.booking.supplier,
        supplierOrderId: result.booking.supplierOrderId,
        message: 'Booking created successfully (ON HOLD)',
      };
    } catch (error: any) {
      this.logger.error('Booking creation failed');

      // Rollback supplier order if DB save fails
      if (supplierOrderId) {
        try {
          let cancelService: AmadeusService | DuffelService | null = null;

          if (supplier === 'AMADEUS') {
            cancelService = this.amadeusService;
          } else if (supplier === 'DUFFEL') {
            cancelService = this.duffelService;
          }

          if (cancelService) {
            await cancelService.cancelOrder(supplierOrderId);
            this.logger.warn(
              `Rolled back ${supplier} order: ${supplierOrderId}`,
            );
          }
        } catch (cancelErr: any) {
          this.logger.error(
            `Failed to rollback ${supplier} order: ${supplierOrderId}`,
          );
        }
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Booking failed');
    }
  }

  // ══════════════════════════════════════════════════════
  // HELPERS: Amadeus traveler format
  // ══════════════════════════════════════════════════════
  private mapTravelerType(type?: string): string {
    const t = (type || '').toUpperCase();
    if (t === 'CHILD') return 'CHILD';
    if (t === 'INFANT') return 'HELD_INFANT';
    return 'ADULT';
  }

  private mapGender(gender?: string): string {
    const g = (gender || '').toUpperCase();
    if (g === 'FEMALE') return 'FEMALE';
    return 'MALE';
  }

  private formatDateOnly(value?: string | Date | null): string | undefined {
    if (!value) return undefined;
    const d = new Date(value);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString().slice(0, 10);
  }

  private toIso2CountryCode(value?: string): string {
    if (!value) return 'BD';

    const v = value.trim().toUpperCase();

    if (v.length === 2) return v;

    const countryMap: Record<string, string> = {
      BANGLADESH: 'BD',
      'SAUDI ARABIA': 'SA',
      SAUDI: 'SA',
      'UNITED ARAB EMIRATES': 'AE',
      UAE: 'AE',
      INDIA: 'IN',
      PAKISTAN: 'PK',
      'UNITED KINGDOM': 'GB',
      UK: 'GB',
      ENGLAND: 'GB',
      'UNITED STATES': 'US',
      USA: 'US',
      AMERICA: 'US',
      MALAYSIA: 'MY',
      SINGAPORE: 'SG',
      QATAR: 'QA',
      KUWAIT: 'KW',
      BAHRAIN: 'BH',
      OMAN: 'OM',
      JORDAN: 'JO',
      EGYPT: 'EG',
      TURKEY: 'TR',
      INDONESIA: 'ID',
      PHILIPPINES: 'PH',
      NEPAL: 'NP',
      'SRI LANKA': 'LK',
      MALDIVES: 'MV',
      MYANMAR: 'MM',
      THAILAND: 'TH',
      CHINA: 'CN',
      JAPAN: 'JP',
      'SOUTH KOREA': 'KR',
      KOREA: 'KR',
      GERMANY: 'DE',
      FRANCE: 'FR',
      ITALY: 'IT',
      SPAIN: 'ES',
      NETHERLANDS: 'NL',
      CANADA: 'CA',
      AUSTRALIA: 'AU',
      'NEW ZEALAND': 'NZ',
      'SOUTH AFRICA': 'ZA',
      NIGERIA: 'NG',
      KENYA: 'KE',
      ETHIOPIA: 'ET',
      AFGHANISTAN: 'AF',
      IRAN: 'IR',
      IRAQ: 'IQ',
      SYRIA: 'SY',
      LEBANON: 'LB',
      YEMEN: 'YE',
      RUSSIA: 'RU',
      BRAZIL: 'BR',
      MEXICO: 'MX',
      ARGENTINA: 'AR',
    };

    return countryMap[v] || 'BD';
  }

  private toAmadeusTravelers(passengers: any[]) {
    return passengers.map((p, index) => {
      const traveler: any = {
        id: String(index + 1),
        travelerType: this.mapTravelerType(p.type),
        dateOfBirth: this.formatDateOnly(p.dateOfBirth),
        gender: this.mapGender(p.gender),
        name: {
          firstName: (p.firstName || '').toUpperCase(),
          lastName: (p.lastName || '').toUpperCase(),
        },
      };

      if (p.email || p.phone) {
        traveler.contact = {
          ...(p.email ? { emailAddress: p.email } : {}),
          ...(p.phone
            ? {
                phones: [
                  {
                    deviceType: 'MOBILE',
                    countryCallingCode: '880',
                    number: String(p.phone)
                      .replace(/^\+?880/, '')
                      .replace(/\D/g, ''),
                  },
                ],
              }
            : {}),
        };
      }

      if (p.passportNumber) {
        const nationalityCode = this.toIso2CountryCode(p.nationality);

        traveler.documents = [
          {
            documentType: 'PASSPORT',
            number: p.passportNumber,
            expiryDate: this.formatDateOnly(p.passportExpiry),
            issuanceCountry: nationalityCode,
            nationality: nationalityCode,
            holder: true,
          },
        ];
      }

      return traveler;
    });
  }

  private toAmadeusContacts(passengers: any[], contact?: any) {
    const firstPassenger = passengers?.[0];

    const email = contact?.email || firstPassenger?.email;
    const phone = contact?.phone || firstPassenger?.phone;
    const countryCallingCode = contact?.countryCallingCode || '880';

    if (!email && !phone) return undefined;

    return [
      {
        addresseeName: {
          firstName: (firstPassenger?.firstName || 'Passenger').toUpperCase(),
          lastName: (firstPassenger?.lastName || 'Name').toUpperCase(),
        },
        companyName: 'MIJI PORTAL',
        purpose: 'STANDARD',

        address: {
          lines: [contact?.addressLine || 'Dhaka, Bangladesh'],
          postalCode: contact?.postalCode || '1000',
          cityName: contact?.cityName || 'Dhaka',
          countryCode: this.toIso2CountryCode(contact?.countryCode || 'BD'),
        },

        ...(email ? { emailAddress: email } : {}),
        ...(phone
          ? {
              phones: [
                {
                  deviceType: 'MOBILE',
                  countryCallingCode,
                  number: String(phone)
                    .replace(/^\+/, '')
                    .replace(countryCallingCode, '')
                    .replace(/\D/g, ''),
                },
              ],
            }
          : {}),
      },
    ];
  }
}