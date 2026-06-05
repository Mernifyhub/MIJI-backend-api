import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { computeBookingPayment } from 'src/common/lib/accounting';

@Injectable()
export class AgentBookingService {
  private readonly logger = new Logger(AgentBookingService.name);

  constructor(private readonly prisma: PrismaService) {}

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

    // Request reviewer info load করো
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

    // reviewer id → display name map
    const reviewerMap = new Map(
  reviewers.map((u) => {
    const displayName =
      `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
      u.email ||
      u.id;

    return [u.id, displayName];
  }),
);
  /*   const reviewerMap = new Map(
      reviewers.map((u) => {
        let displayName = '';
        if (u.role === 'ADMIN') {
          displayName = `Admin ${u.firstName ||u.lastName  || ''}`.trim();
        } else if (u.role === 'MANAGER') {
          displayName = `Manager ${ u.firstName || u.lastName || ''}`.trim();
        } else {
          displayName =
            `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
            u.email ||
            u.id;
        }
        return [u.id, displayName];
      }),
    ); */

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

    // booking exists এবং এই agent-এর কিনা check
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, agentId },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    // same type-এর pending request আগে থেকে আছে কিনা check
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
      `✅ Request created | Type: ${type} | Booking: ${bookingId} | Agent: ${agentId}`,
    );

    return {
      success: true,
      requestId: request.id,
      message: `${type} request submitted successfully`,
    };
  }

  // ──────────────────────────────────────────────
  // CREATE BOOKING
  // ──────────────────────────────────────────────
  async createBooking(agentId: string, body: any) {
    try {
      // ── Body থেকে দরকারি fields নাও ──
      const {
        carrier,
        origin,
        destination,
        departure,
        arrival,
        tripType,
        netFare,
        baseFare,
        segments,
        passengers,
        checkedBag,
        cabinBag,
        checkedBagRaw,
        cabinBagRaw,
        refundable,
        changeable,
        refundPenalty,
        changePenalty,
        cabinClass,
        currency,
      } = body;

      const fare = Number(netFare);
      const grossFare = Number(baseFare) || fare;

      // ── Input Validation ──
      if (!agentId) throw new BadRequestException('Agent ID is missing');
      if (isNaN(fare) || fare <= 0) throw new BadRequestException('Invalid fare amount');
      if (!carrier || !origin || !destination || !departure || !tripType)
        throw new BadRequestException('Missing required booking fields');
      if (!Array.isArray(passengers) || passengers.length === 0)
        throw new BadRequestException('Passengers are required');
      if (!Array.isArray(segments) || segments.length === 0)
        throw new BadRequestException('Segments are required');

      // ── Unique PNR এবং Booking ID generate করো ──
      const pnr = await this.getUniquePNR();
      const bookingId = `MBK${Date.now()}`;

      // ══════════════════════════════════════════
      // DB TRANSACTION — Core booking operations
      // শুধু critical DB writes এখানে থাকবে
      // Notification transaction-এর বাইরে হবে
      // ══════════════════════════════════════════
      const result = await this.prisma.$transaction(
        async (tx) => {
          // ── Step 1: Agent info fetch ──
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

          const issuedByName =
            agent.agentName ||
            `${agent.firstName || ''} ${agent.lastName || ''}`.trim() ||
            'Unknown';

          const agentDisplayName =
            agent.agentName?.trim() ||
            `${agent.firstName ?? ''} ${agent.lastName ?? ''}`.trim() ||
            'Agent';

          // ── Step 2: Payment breakdown calculate করো ──
          // Balance থেকে কত নেবে, Credit থেকে কত নেবে
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

          // ── Step 3: Agent balance update করো ──
          // select দিয়ে updated value নিচ্ছি — ledger-এ use করব
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

          // ── Step 4: Booking create করো (passengers + segments সহ) ──
          const booking = await tx.booking.create({
            data: {
              bookingId,
              pnr,
              status: 'ON_HOLD',
              tripType: tripType as any,
              route: `${origin}-${destination}`,
              departureDate: new Date(departure),
              returnDate: arrival ? new Date(arrival) : null,
              issuedBy: issuedByName,
              carrier,
              agentId,
              net: fare,
              gross: grossFare,
              commission: 0,
              currency: currency || 'SAR',
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
              remarks:
                payment.fromCredit > 0
                  ? `Payment: ${payment.fromBalance > 0 ? `Balance ${payment.fromBalance} + ` : ''}Credit ${payment.fromCredit} SAR`
                  : `Payment: Balance ${payment.fromBalance} SAR`,
              passengers: {
                create: passengers.map((p: any) => ({
                  title: p.title as any,
                  firstName: p.firstName,
                  lastName: p.lastName,
                  type: p.type as any,
                  gender: p.gender as any,
                  dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
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
                create: segments.map((s: any) => ({
                  from: s.from,
                  to: s.to,
                  departure: new Date(s.departure),
                  arrival: new Date(s.arrival),
                  flightNo: s.flightNo,
                  airline: s.airline,
                })),
              },
            },
          });

          // ── Step 5: Ledger entry (১টাই row — 1 booking = 1 ledger) ──
          const passengerNames = passengers
            .map((p: any) => `${p.firstName} ${p.lastName}`)
            .join(', ');

          // Total debit = balance part + credit part
          const totalDebit =
            Number(payment.fromBalance || 0) + Number(payment.fromCredit || 0);

          // Net account position = wallet balance - used credit limit
          // Example: balance=0, usedLimit=714 → balanceAfter = -714
          const ledgerBalanceAfter =
            Number(updatedAgent.balance || 0) -
            Number(updatedAgent.usedLimit || 0);

          await tx.agentLedger.create({
            data: {
              userId: agentId,
              type: 'ON_HOLD',
              sourceType: 'BOOKING',
              sourceId: booking.id,
              bookingId: booking.id,
              invoiceNo: `INV-${bookingId}`,
              debit: totalDebit,
              credit: 0,
              balanceAfter: ledgerBalanceAfter,
              currency: currency || 'SAR',
              pnr,
              reference: bookingId,
              description: `Booking ON HOLD | ${origin}-${destination} | PNR: ${pnr} | ${carrier} | Pax: ${passengerNames} | Payment Split: Balance ${payment.fromBalance} + Credit ${payment.fromCredit}`,
              status: 'COMPLETED',
              createdBy: agent.agentName || agentId,
            },
          });

          // ── Step 6: Payment record ──
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              userId: agentId,
              amount: fare,
              currency: currency || 'SAR',
              method: 'MANUAL',
              status: 'SUCCESS',
              paidAt: new Date(),
              transactionId: bookingId,
            },
          });

          // transaction থেকে যা দরকার return করো
          return {
            booking,
            payment,
            agentInfo: {
              id: agent.id,
              name: agentDisplayName,
            },
          };
        },
        {
          timeout: 10000, // 10 seconds — complex booking-এর জন্য safe
        },
      );

      // ══════════════════════════════════════════
      // NOTIFICATION — Transaction-এর বাইরে
      // Notification fail হলেও booking rollback হবে না
      // ══════════════════════════════════════════
      try {
        // Agent-কে notification দাও
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

        // সব Admin ও Manager-দের notification দাও
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
        // Notification fail হলে শুধু warn করো, booking সফল
        this.logger.warn(
          `Booking created but notification failed: ${notifyError?.message}`,
        );
      }

      // ── Final Response ──
      return {
        success: true,
        bookingId: result.booking.bookingId,
        pnr: result.booking.pnr,
        paymentMethod: result.payment.paymentMethod,
        deducted: {
          fromBalance: result.payment.fromBalance,
          fromCredit: result.payment.fromCredit,
          total: result.payment.fare,
        },
        message: 'Booking created successfully',
      };
    } catch (error: any) {
      this.logger.error('Booking creation failed', error?.message);

      // Known errors সরাসরি throw করো
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Unknown errors → generic 500
      throw new InternalServerErrorException('Booking failed');
    }
  }

  // ──────────────────────────────────────────────
  // PNR Generator — 6 character alphanumeric
  // ──────────────────────────────────────────────
  private generatePNR(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pnr = '';
    for (let i = 0; i < 6; i++) {
      pnr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pnr;
  }

  // Unique PNR — DB-তে আগে থেকে নেই নিশ্চিত করো
  private async getUniquePNR(): Promise<string> {
    let pnr = this.generatePNR();
    let exists = await this.prisma.booking.findFirst({ where: { pnr } });
    while (exists) {
      pnr = this.generatePNR();
      exists = await this.prisma.booking.findFirst({ where: { pnr } });
    }
    return pnr;
  }
}