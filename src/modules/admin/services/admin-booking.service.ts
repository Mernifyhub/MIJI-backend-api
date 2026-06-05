// src/modules/admin/services/admin-booking.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  BookingStatus,
  TripType,
  PaymentMethod,
  PaymentStatus,
  LedgerType,
  LedgerSourceType,
  LedgerStatus,
} from '@prisma/client';

@Injectable()
export class AdminBookingService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────
  // GET ALL BOOKINGS (Admin) — UNCHANGED
  // ──────────────────────────────────
  async getAllBookings() {
    const bookings = await this.prisma.booking.findMany({
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

  // ──────────────────────────────────
  // GET SINGLE BOOKING BY ID — UNCHANGED
  // ──────────────────────────────────
  async getBookingById(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId },
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

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

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
      carrier: booking.carrier,
      currency: booking.currency,
      cabinClass: booking.cabinClass,
      baggageInfo: booking.baggageInfo,
      conditions: booking.conditions,
      remarks: booking.remarks,
      bookingDate: booking.bookingDate,
      createdAt: booking.createdAt,
      issuedBy: booking.issuedBy || '',
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

  // ══════════════════════════════════════════════
  // ↓↓↓ IMPORT BOOKING — নতুন methods ↓↓↓
  // ══════════════════════════════════════════════

  // ── UUID বা agentId (MPA001) দুটো দিয়েই agent find করবে ──
  private async findAgentByRef(agentRef: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { id: agentRef },
          { agentId: agentRef },
        ],
      },
      select: {
        id: true,
        agentId: true,
        agentName: true,
        email: true,
        phone: true,
        balance: true,
        creditLimit: true,
        usedLimit: true,
        status: true,
      },
    });
  }

  // ══════════════════════════════════════════════
  // LOAD PNR FROM GDS
  // ══════════════════════════════════════════════
  async loadPnrFromGDS(pnr: string, lastName: string, agentRef: string) {
    const agent = await this.findAgentByRef(agentRef);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.status !== 'ACTIVE') {
      throw new BadRequestException('Agent account is not active');
    }

    // ✅ already imported কিনা check
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        pnr: pnr.toUpperCase(),
        agentId: agent.id,
      },
    });

    if (existingBooking) {
      throw new BadRequestException(
        `PNR ${pnr.toUpperCase()} is already imported for this agent (Booking: ${existingBooking.bookingId})`,
      );
    }

    const gdsData = await this.fetchFromGDS(pnr, lastName);

    if (!gdsData) {
      throw new NotFoundException(
        `No booking found for PNR: ${pnr} with last name: ${lastName}`,
      );
    }

    return {
      booking: gdsData,
      agent: {
        id: agent.id,
        agentId: agent.agentId,
        agentName: agent.agentName,
        balance: Number(agent.balance || 0),
        creditLimit: Number(agent.creditLimit || 0),
        usedLimit: Number(agent.usedLimit || 0),
      },
    };
  }

  // ══════════════════════════════════════════════
  // SAVE IMPORTED BOOKING → AGENT HOLD LIST
  // ══════════════════════════════════════════════
  async saveImportedBooking(
    adminUserId: string,
    body: {
      agentId: string;
      pnr: string;
      bookingData: any;
    },
  ) {
    const { agentId, pnr, bookingData } = body;

    // ✅ Agent find করো
    const agent = await this.findAgentByRef(agentId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.status !== 'ACTIVE') {
      throw new BadRequestException('Agent account is not active');
    }

    // ✅ Duplicate PNR check
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        pnr: pnr.toUpperCase(),
        agentId: agent.id,
      },
    });

    if (existingBooking) {
      throw new BadRequestException(
        `PNR ${pnr.toUpperCase()} already exists for this agent`,
      );
    }

    const segments: any[] = bookingData?.segments || [];
    const passengers: any[] = bookingData?.passengers || [];

    if (!segments.length) {
      throw new BadRequestException(
        'No flight segments found in GDS booking',
      );
    }

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    if (!firstSeg?.departureDate) {
      throw new BadRequestException(
        'Departure date is missing in GDS booking',
      );
    }

    // ✅ Balance calculation (exact)
    const totalFare = Number(bookingData?.fare?.totalFare || 0);
    const currentBalance = Number(agent.balance || 0);
    const creditLimit = Number(agent.creditLimit || 0);
    const usedLimit = Number(agent.usedLimit || 0);
    const availableCredit = Math.max(creditLimit - usedLimit, 0);
    const totalAvailable = currentBalance + availableCredit;

    if (totalFare > 0 && totalFare > totalAvailable) {
      throw new BadRequestException(
        `Insufficient balance. Required: SAR ${totalFare.toFixed(2)}, Available: SAR ${totalAvailable.toFixed(2)} (Balance: SAR ${currentBalance.toFixed(2)} + Credit: SAR ${availableCredit.toFixed(2)})`,
      );
    }

    // ✅ কতটুকু balance থেকে, কতটুকু credit থেকে যাবে
    const deductFromBalance = Math.min(currentBalance, totalFare);
    const deductFromCredit = totalFare - deductFromBalance;
    const balanceAfter = currentBalance - deductFromBalance;

    // ✅ Meta data
    const bookingCount = await this.prisma.booking.count();
    const bookingId = `BK-${String(bookingCount + 1).padStart(6, '0')}`;
    const route = `${firstSeg.origin || ''} - ${lastSeg.destination || ''}`;
    const carrier = firstSeg.airline || bookingData?.airline || '';
    const currency = bookingData?.fare?.currency || 'SAR';
    const tripType: TripType =
      segments.length > 1 ? TripType.ROUND_TRIP : TripType.ONE_WAY;

    // ✅ Transaction
    const result = await this.prisma.$transaction(async (tx) => {

      // 1. Booking create
      const booking = await tx.booking.create({
        data: {
          bookingId,
          agentId: agent.id,
          pnr: pnr.toUpperCase(),
          status: BookingStatus.ON_HOLD,
          tripType,
          route,
          carrier,
          departureDate: new Date(
            `${firstSeg.departureDate}T${firstSeg.departureTime || '00:00'}`,
          ),
          returnDate:
            segments.length > 1 && lastSeg?.departureDate
              ? new Date(
                  `${lastSeg.departureDate}T${lastSeg.departureTime || '00:00'}`,
                )
              : undefined,
          currency,
          cabinClass: bookingData?.fare?.cabinClass || 'ECONOMY',
          baggageInfo: firstSeg?.baggage
            ? { info: firstSeg.baggage }
            : undefined,
          bookingDate: new Date(),
          net: totalFare,
          gross: totalFare,
          commission: 0,
          issuedBy: 'GDS_IMPORT',
          remarks: `GDS imported booking. Airline: ${bookingData?.airline || carrier}`,

          // ✅ Passengers nested create
          passengers: {
            create: passengers.map((p: any) => ({
              title: p.title || undefined,
              firstName: p.firstName || '',
              lastName: p.lastName || '',
              type: p.type === 'CHD'
                ? 'CHILD'
                : p.type === 'INF'
                ? 'INFANT'
                : 'ADULT',
              gender: p.title === 'MR'
                ? 'MALE'
                : p.title === 'MRS' || p.title === 'MS'
                ? 'FEMALE'
                : undefined,
              dateOfBirth: p.dateOfBirth
                ? new Date(p.dateOfBirth)
                : undefined,
              nationality: p.nationality || undefined,
              passportNumber: p.passportNumber || undefined,
              passportExpiry: p.passportExpiry
                ? new Date(p.passportExpiry)
                : undefined,
              email: p.email || undefined,
              phone: p.phone || undefined,
            })),
          },

          // ✅ Segments nested create — FlightSegment model
          segments: {
            create: segments.map((s: any) => ({
              from: s.origin || '',
              to: s.destination || '',
              departure: new Date(
                `${s.departureDate}T${s.departureTime || '00:00'}`,
              ),
              arrival: new Date(
                `${s.arrivalDate || s.departureDate}T${s.arrivalTime || '00:00'}`,
              ),
              flightNo: s.flightNumber || '',
              airline: s.airline || carrier,
            })),
          },
        },
      });

      // 2. Payment create — ✅ schema-exact fields
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          userId: agent.id,
          amount: totalFare,
          currency,
          method: PaymentMethod.MANUAL,
          status: PaymentStatus.SUCCESS,
          paidAt: new Date(),
        },
      });

      // 3. ✅ Agent balance/usedLimit update — exact calculation
      await tx.user.update({
        where: { id: agent.id },
        data: {
          // balance থেকে deductFromBalance টাকা কমবে
          balance: { decrement: deductFromBalance },

          // credit থেকে ব্যবহার হলে usedLimit বাড়বে
          ...(deductFromCredit > 0 && {
            usedLimit: { increment: deductFromCredit },
          }),
        },
      });

      // 4. ✅ AgentLedger entry — audit trail
      await tx.agentLedger.create({
        data: {
          userId: agent.id,
          type: LedgerType.ON_HOLD,
          sourceType: LedgerSourceType.BOOKING,
          sourceId: booking.id,
          debit: totalFare,
          credit: 0,
          balanceAfter,
          currency,
          bookingId: booking.id,
          pnr: pnr.toUpperCase(),
          description: `GDS Import — PNR: ${pnr.toUpperCase()} | Route: ${route}`,
          status: LedgerStatus.COMPLETED,
          createdBy: adminUserId,
          note: `Imported by admin/manager. Deducted from balance: SAR ${deductFromBalance.toFixed(2)}, Credit used: SAR ${deductFromCredit.toFixed(2)}`,
        },
      });

      return booking;
    });

    return {
      success: true,
      message: `Booking ${bookingId} imported and saved to ${agent.agentName}'s hold list`,
      booking: {
        id: result.id,
        bookingId: result.bookingId,
        pnr: result.pnr,
        status: result.status,
        route: result.route,
        amount: totalFare,
        deductedFromBalance: deductFromBalance,
        deductedFromCredit: deductFromCredit,
        balanceAfter,
      },
    };
  }


  // ══════════════════════════════════════════════
  // MOCK GDS FETCH
  // Production এ real GDS API দিয়ে replace করবেন
  // ══════════════════════════════════════════════
  private async fetchFromGDS(
    pnr: string,
    lastName: string,
  ): Promise<any | null> {
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (pnr.length !== 6) return null;

    const depDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    return {
      pnr: pnr.toUpperCase(),
      status: 'CONFIRMED',
      airline: 'Saudi Airlines (SV)',
      bookingDate: new Date().toISOString(),
      timeLimit: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      passengers: [
        {
          title: 'MR',
          firstName: 'PASSENGER',
          lastName: lastName.toUpperCase(),
          type: 'ADT',
          ticketNumber: null,
          passportNumber: null,
          nationality: null,
        },
      ],
      segments: [
        {
          segmentNumber: 1,
          airline: 'SV',
          flightNumber: 'SV832',
          class: 'Y',
          departureDate: depDate,
          departureTime: '08:30',
          arrivalDate: depDate,
          arrivalTime: '14:45',
          origin: 'RUH',
          destination: 'DAC',
          status: 'HK',
          terminal: '1',
          baggage: '30KG',
          duration: '6h 15m',
        },
      ],
      fare: {
        baseFare: 1200,
        tax: 350,
        serviceFee: 50,
        totalFare: 1600,
        currency: 'SAR',
        fareType: 'Published',
        cabinClass: 'Economy',
      },
      remarks: [
        'GDS imported booking',
        `Last name verified: ${lastName.toUpperCase()}`,
      ],
    };
  }
}