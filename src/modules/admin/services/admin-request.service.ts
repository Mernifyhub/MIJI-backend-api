import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const VALID_REQUEST_TYPES = ['ISSUE', 'REISSUE', 'CANCEL', 'VOID', 'REFUND'];
const VALID_ACTIONS = ['APPROVED', 'REJECTED', 'PROCESSING'];
const BOOKING_STATUS_MAP: Record<string, string> = {
  ISSUE: 'CONFIRMED',
  CANCEL: 'CANCELLED',
  REISSUE: 'CONFIRMED',
  VOID: 'VOIDED',
  REFUND: 'REFUNDED',
};

@Injectable()
export class AdminRequestService {
  private readonly logger = new Logger(AdminRequestService.name);
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────
  // GET ALL REQUESTS
  // ──────────────────────────────────────
  async getAllRequests(query?: { type?: string }) {
    const where: any = {
      status: { in: ['PENDING', 'PROCESSING'] },
    };

    if (query?.type) {
      if (!VALID_REQUEST_TYPES.includes(query.type)) {
        throw new BadRequestException(
          `Invalid type: ${query.type}. Valid: ${VALID_REQUEST_TYPES.join(', ')}`,
        );
      }
      where.type = query.type;
    }

    return this.prisma.bookingRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        booking: {
          select: {
            id: true,
            bookingId: true,
            pnr: true,
            route: true,
            departureDate: true,
            status: true,
            gross: true,
          },
        },
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
            email: true,
            phone: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
          },
        },
      },
    });
  }

  // ──────────────────────────────────────
  // GET SINGLE REQUEST
  // ──────────────────────────────────────
  async getRequestById(requestId: string) {
    const request = await this.prisma.bookingRequest.findUnique({
      where: { id: requestId },
      include: {
        booking: {
          include: {
            passengers: true,
            segments: true,
          },
        },
        agent: {
          select: {
            id: true,
            agentId: true,
            firstName: true,
            lastName: true,
            agentName: true,
            email: true,
            phone: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
          },
        },
      },
    });

    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  // ──────────────────────────────────────
  // ASSIGN REQUEST
  // ──────────────────────────────────────
  async assignRequest(requestId: string, userId: string) {
    if (!userId) throw new BadRequestException('User ID is required');

    const existing = await this.prisma.bookingRequest.findUnique({
      where: { id: requestId },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
          },
        },
      },
    });

    if (!existing) throw new NotFoundException('Request not found');

    if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
      throw new BadRequestException('Completed request cannot be assigned');
    }

    if (existing.assignedToId && existing.assignedToId !== userId) {
      const assignedName =
        existing.assignedTo?.agentName ||
        `${existing.assignedTo?.firstName || ''} ${existing.assignedTo?.lastName || ''}`.trim() ||
        'another user';
      throw new ConflictException(`Already assigned to ${assignedName}`);
    }

    if (existing.assignedToId === userId) {
      throw new BadRequestException('Already assigned to you');
    }

    const updated = await this.prisma.bookingRequest.update({
      where: { id: requestId },
      data: { assignedToId: userId, assignedAt: new Date() },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
          },
        },
      },
    });

    this.logger.log(`✅ Request ${requestId} assigned to ${userId}`);
    return updated;
  }

  // ──────────────────────────────────────
  // RELEASE REQUEST
  // ──────────────────────────────────────
  async releaseRequest(requestId: string, userId: string) {
    if (!userId) throw new BadRequestException('User ID is required');

    const existing = await this.prisma.bookingRequest.findUnique({
      where: { id: requestId },
      select: { id: true, assignedToId: true },
    });

    if (!existing) throw new NotFoundException('Request not found');
    if (!existing.assignedToId) {
      throw new BadRequestException('Request is not assigned to anyone');
    }
    if (existing.assignedToId !== userId) {
      throw new ForbiddenException('Only the assigned user can release this request');
    }

    const updated = await this.prisma.bookingRequest.update({
      where: { id: requestId },
      data: { assignedToId: null, assignedAt: null },
    });

    this.logger.log(`✅ Request ${requestId} released by ${userId}`);
    return updated;
  }

  // ──────────────────────────────────────
  // PROCESS REQUEST
  // ──────────────────────────────────────
  async processRequest(
    requestId: string,
    adminId: string,
    body: {
      action: string;
      adminNote?: string;
      gdsPnr?: string;
      ticketNumber?: string;
      supplierName?: string;
      issueAmount?: number;
    },
  ) {
    const { action, adminNote, gdsPnr, ticketNumber, supplierName, issueAmount } = body;

    // ── Validate action ──
    if (!action || !VALID_ACTIONS.includes(action)) {
      throw new BadRequestException(
        `Invalid action '${action}'. Valid: ${VALID_ACTIONS.join(', ')}`,
      );
    }

    // ── Find request ──
    const request = await this.prisma.bookingRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        type: true,
        status: true,
        bookingId: true,
        assignedToId: true,
        agentId: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Request not found: ${requestId}`);
    }

    this.logger.warn(
      `[processRequest] requestId=${requestId} | type=${request.type} | action=${action} | bookingId=${request.bookingId}`,
    );

    // ── Already processed ──
    if (request.status === 'APPROVED' || request.status === 'REJECTED') {
      throw new BadRequestException(`Request already ${request.status}`);
    }

    // ── Assigned to someone else ──
    if (request.assignedToId && adminId && request.assignedToId !== adminId) {
      throw new ConflictException('This request is assigned to another user');
    }

    // ── ISSUE validation ──
    if (request.type === 'ISSUE' && action === 'APPROVED') {
      if (!gdsPnr?.toString().trim()) {
        throw new BadRequestException('GDS PNR is required for issue approval');
      }
      if (!ticketNumber?.toString().trim()) {
        throw new BadRequestException('Ticket Number is required for issue approval');
      }
      if (!supplierName?.toString().trim()) {
        throw new BadRequestException('Supplier Name is required for issue approval');
      }
    }

    // ── Build update data ──
    const updateData: any = {
      status: action,
      adminNote: adminNote ?? null,
      processedAt: new Date(),
      processedBy: adminId,
    };

    if (gdsPnr != null) updateData.gdsPnr = String(gdsPnr).trim();
    if (ticketNumber != null) updateData.ticketNumber = String(ticketNumber).trim();
    if (supplierName != null) updateData.supplierName = String(supplierName).trim();
    if (issueAmount != null) updateData.issueAmount = Number(issueAmount);

    if (action === 'APPROVED' || action === 'REJECTED') {
      updateData.assignedToId = null;
      updateData.assignedAt = null;
    }

    // ══════════════════════════════════════════════
    // TRANSACTION
    // ══════════════════════════════════════════════
    const result = await this.prisma.$transaction(async (tx) => {
      // 1) Update request
      const updatedRequest = await tx.bookingRequest.update({
        where: { id: requestId },
        data: updateData,
      });

      // 2) Load booking
      const booking = await tx.booking.findUnique({
        where: { id: request.bookingId },
        select: {
          id: true,
          bookingId: true,
          agentId: true,
          pnr: true,
          route: true,
          net: true,
          currency: true,
          status: true,
        },
      });

      if (!booking) {
        throw new NotFoundException(`Booking not found: ${request.bookingId}`);
      }

      // 3) Admin info
      const admin = await tx.user.findUnique({
        where: { id: adminId },
        select: { firstName: true, lastName: true, role: true },
      });

      const adminName = admin
  ? `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || 
    (admin.role === 'ADMIN' ? 'Admin' : 'Manager')
  : 'Admin';

      // 4) Other admins for notification
      const otherAdmins = await tx.user.findMany({
        where: {
          role: { in: ['ADMIN', 'MANAGER'] },
          id: { not: adminId },
        },
        select: { id: true },
      });

      const finalPnr = String(gdsPnr || booking.pnr || '').trim();
      const newBookingStatus = BOOKING_STATUS_MAP[request.type] || null;

      // ════════════════════════════════
      // APPROVED
      // ════════════════════════════════
      if (action === 'APPROVED') {

        // Update booking status
        if (newBookingStatus) {
          const bookingData: any = { status: newBookingStatus as any };
          if (request.type === 'ISSUE' && finalPnr) {
            bookingData.pnr = finalPnr;
          }
          await tx.booking.update({
            where: { id: booking.id },
            data: bookingData,
          });
        }

        // ─────────────────────────────
        // ISSUE → TICKET
        // ─────────────────────────────
        if (request.type === 'ISSUE') {
          const ledgerData: any = {
            type: 'TICKET',
            status: 'COMPLETED',
            reference: booking.bookingId,
            invoiceNo: `INV-${booking.bookingId}`,
            description:
              `Ticket Issued | ${booking.route || 'N/A'} | PNR: ${finalPnr || 'N/A'}` +
              (ticketNumber ? ` | Ticket: ${ticketNumber}` : '') +
              (supplierName ? ` | Supplier: ${supplierName}` : ''),
          };

          if (finalPnr) ledgerData.pnr = finalPnr;

          // Primary update
          let ledgerResult = await tx.agentLedger.updateMany({
            where: {
              userId: booking.agentId,
              bookingId: booking.id,
              type: { in: ['ON_HOLD', 'TICKET'] },
            },
            data: ledgerData,
          });

          // Fallback — without userId filter
          if (ledgerResult.count === 0) {
            ledgerResult = await tx.agentLedger.updateMany({
              where: {
                bookingId: booking.id,
                type: { in: ['ON_HOLD', 'TICKET'] },
              },
              data: ledgerData,
            });
          }

          this.logger.warn(
            `[LEDGER][ISSUE] bookingId=${booking.id} | updated=${ledgerResult.count}`,
          );

          // Debug if still 0
          if (ledgerResult.count === 0) {
            const rows = await tx.agentLedger.findMany({
              where: { bookingId: booking.id },
              select: {
                id: true,
                userId: true,
                bookingId: true,
                type: true,
                sourceType: true,
              },
            });
            this.logger.error(
              `[LEDGER][ISSUE] No rows updated! Existing: ${JSON.stringify(rows)}`,
            );
          }

          // Agent notification
          await tx.notification.create({
            data: {
              userId: booking.agentId,
              type: 'booking',
              title: '✅ Ticket Issued',
              message:
                `Your booking ${booking.bookingId} confirmed! ` +
                `PNR: ${finalPnr || 'N/A'} | ${booking.route || 'N/A'} | ` +
                `Ticket: ${ticketNumber || 'N/A'} | By ${adminName}`,
              action: `/bookings/${booking.id}`,
              read: false,
            },
          });

          // Other admins notification
          if (otherAdmins.length > 0) {
            await tx.notification.createMany({
              data: otherAdmins.map((a) => ({
                userId: a.id,
                type: 'booking',
                title: '✅ Issue Approved',
                message:
                  `${adminName} approved ISSUE for ${booking.bookingId} | ` +
                  `PNR: ${finalPnr || 'N/A'} | ${booking.route || 'N/A'}`,
                action: '/admin/bookings/Ticketed',
                read: false,
              })),
            });
          }
        }

        // ─────────────────────────────
        // CANCEL → CANCELLED
        // ─────────────────────────────
        else if (request.type === 'CANCEL') {
          const ledgerResult = await tx.agentLedger.updateMany({
            where: {
              userId: booking.agentId,
              bookingId: booking.id,
              type: { in: ['ON_HOLD', 'TICKET'] },
            },
            data: {
              type: 'CANCELLED',
              status: 'COMPLETED',
              description: `Booking Cancelled | ${booking.route || 'N/A'}`,
            },
          });

          this.logger.warn(
            `[LEDGER][CANCEL] bookingId=${booking.id} | updated=${ledgerResult.count}`,
          );

          // Refund if specified
          if (issueAmount != null && Number(issueAmount) > 0) {
            const refund = Number(issueAmount);
            const agent = await tx.user.findUnique({
              where: { id: booking.agentId },
              select: { balance: true, usedLimit: true },
            });

            if (agent) {
              const walletBalance = Math.max(0, Number(agent.balance || 0));
              const usedLimit = Number(agent.usedLimit || 0);
              const creditRepaid = Math.min(refund, usedLimit);
              const newBalance = walletBalance + (refund - creditRepaid);
              const newUsedLimit = Math.max(0, usedLimit - creditRepaid);

              await tx.user.update({
                where: { id: booking.agentId },
                data: { balance: newBalance, usedLimit: newUsedLimit },
              });

              await tx.agentLedger.create({
                data: {
                  userId: booking.agentId,
                  bookingId: booking.id,
                  type: 'REFUNDED',
                  sourceType: 'BOOKING',
                  sourceId: booking.id,
                  operationId: null,
                  debit: 0,
                  credit: refund,
                  balanceAfter: newBalance,
                  currency: booking.currency || 'SAR',
                  status: 'COMPLETED',
                  description: `Refund for Cancelled Booking | ${booking.route || 'N/A'} | PNR: ${booking.pnr || 'N/A'}`,
                  pnr: booking.pnr || null,
                  invoiceNo: `INV-${booking.bookingId}-REFUND`,
                  reference: booking.bookingId,
                  createdBy: adminId,
                },
              });
            }
          }

          // Agent notification
          await tx.notification.create({
            data: {
              userId: booking.agentId,
              type: 'booking',
              title: '❌ Booking Cancelled',
              message:
                `Your booking ${booking.bookingId} has been cancelled. ` +
                `${booking.route || 'N/A'}` +
                (issueAmount && Number(issueAmount) > 0
                  ? ` | Refund: ${booking.currency || 'SAR'} ${Number(issueAmount).toLocaleString()}`
                  : '') +
                ` | By ${adminName}`,
              action: `/bookings/${booking.id}`,
              read: false,
            },
          });

          if (otherAdmins.length > 0) {
            await tx.notification.createMany({
              data: otherAdmins.map((a) => ({
                userId: a.id,
                type: 'booking',
                title: '❌ Cancel Approved',
                message: `${adminName} approved CANCEL for ${booking.bookingId} | ${booking.route || 'N/A'}`,
                action: '/admin/bookings',
                read: false,
              })),
            });
          }
        }

        // ─────────────────────────────
        // VOID → VOID
        // ─────────────────────────────
        else if (request.type === 'VOID') {
          const ledgerResult = await tx.agentLedger.updateMany({
            where: {
              userId: booking.agentId,
              bookingId: booking.id,
              type: { in: ['ON_HOLD', 'TICKET'] },
            },
            data: {
              type: 'VOID',
              status: 'COMPLETED',
              description: `Booking Voided | ${booking.route || 'N/A'}`,
            },
          });

          this.logger.warn(
            `[LEDGER][VOID] bookingId=${booking.id} | updated=${ledgerResult.count}`,
          );

          await tx.notification.create({
            data: {
              userId: booking.agentId,
              type: 'booking',
              title: '🚫 Booking Voided',
              message:
                `Your booking ${booking.bookingId} has been voided. ` +
                `${booking.route || 'N/A'} | By ${adminName}`,
              action: `/bookings/${booking.id}`,
              read: false,
            },
          });

          if (otherAdmins.length > 0) {
            await tx.notification.createMany({
              data: otherAdmins.map((a) => ({
                userId: a.id,
                type: 'booking',
                title: '🚫 Void Approved',
                message: `${adminName} approved VOID for ${booking.bookingId} | ${booking.route || 'N/A'}`,
                action: '/admin/bookings',
                read: false,
              })),
            });
          }
        }

        // ─────────────────────────────
        // REFUND
        // ─────────────────────────────
        else if (request.type === 'REFUND') {
          if (issueAmount != null && Number(issueAmount) > 0) {
            const refund = Number(issueAmount);
            const agent = await tx.user.findUnique({
              where: { id: booking.agentId },
              select: { balance: true, usedLimit: true },
            });

            if (agent) {
              const walletBalance = Math.max(0, Number(agent.balance || 0));
              const usedLimit = Number(agent.usedLimit || 0);
              const creditRepaid = Math.min(refund, usedLimit);
              const newBalance = walletBalance + (refund - creditRepaid);
              const newUsedLimit = Math.max(0, usedLimit - creditRepaid);

              await tx.user.update({
                where: { id: booking.agentId },
                data: { balance: newBalance, usedLimit: newUsedLimit },
              });

              await tx.agentLedger.create({
                data: {
                  userId: booking.agentId,
                  bookingId: booking.id,
                  type: 'REFUNDED',
                  sourceType: 'BOOKING',
                  sourceId: booking.id,
                  operationId: null,
                  debit: 0,
                  credit: refund,
                  balanceAfter: newBalance,
                  currency: booking.currency || 'SAR',
                  status: 'COMPLETED',
                  description: `Refund Processed | ${booking.route || 'N/A'} | PNR: ${booking.pnr || 'N/A'}`,
                  pnr: booking.pnr || null,
                  invoiceNo: `INV-${booking.bookingId}-REFUND`,
                  reference: booking.bookingId,
                  createdBy: adminId,
                },
              });
            }
          }

          await tx.notification.create({
            data: {
              userId: booking.agentId,
              type: 'booking',
              title: '↩️ Refund Processed',
              message:
                `Refund for booking ${booking.bookingId} processed. ` +
                `${booking.route || 'N/A'}` +
                (issueAmount && Number(issueAmount) > 0
                  ? ` | Amount: ${booking.currency || 'SAR'} ${Number(issueAmount).toLocaleString()}`
                  : '') +
                ` | By ${adminName}`,
              action: `/bookings/${booking.id}`,
              read: false,
            },
          });

          if (otherAdmins.length > 0) {
            await tx.notification.createMany({
              data: otherAdmins.map((a) => ({
                userId: a.id,
                type: 'booking',
                title: '↩️ Refund Approved',
                message: `${adminName} approved REFUND for ${booking.bookingId} | ${booking.route || 'N/A'}`,
                action: '/admin/bookings',
                read: false,
              })),
            });
          }
        }
      }

      // ════════════════════════════════
      // REJECTED
      // ════════════════════════════════
      else if (action === 'REJECTED') {
        await tx.notification.create({
          data: {
            userId: booking.agentId,
            type: 'booking',
            title: `⛔ ${request.type} Request Rejected`,
            message:
              `Your ${request.type.toLowerCase()} request for booking ${booking.bookingId} was rejected. ` +
              `${booking.route || 'N/A'}` +
              (adminNote ? ` | Note: ${adminNote}` : '') +
              ` | By ${adminName}`,
            action: `/bookings/${booking.id}`,
            read: false,
          },
        });

        if (otherAdmins.length > 0) {
          await tx.notification.createMany({
            data: otherAdmins.map((a) => ({
              userId: a.id,
              type: 'booking',
              title: `⛔ ${request.type} Rejected`,
              message: `${adminName} rejected ${request.type} for ${booking.bookingId} | ${booking.route || 'N/A'}`,
              action: '/admin/bookings',
              read: false,
            })),
          });
        }
      }

      // ════════════════════════════════
      // PROCESSING
      // ════════════════════════════════
      else if (action === 'PROCESSING') {
        await tx.notification.create({
          data: {
            userId: booking.agentId,
            type: 'booking',
            title: `⏳ ${request.type} In Progress`,
            message:
              `Your ${request.type.toLowerCase()} request for booking ${booking.bookingId} is being processed. ` +
              `${booking.route || 'N/A'} | By ${adminName}`,
            action: `/bookings/${booking.id}`,
            read: false,
          },
        });
      }

      return updatedRequest;
    });

    const actionLabel =
      action === 'APPROVED' ? 'approved'
      : action === 'REJECTED' ? 'rejected'
      : 'marked as processing';

    this.logger.log(`✅ Request ${requestId} ${actionLabel} by ${adminId}`);

    return {
      success: true,
      requestId: result.id,
      status: result.status,
      action,
      message: `Request ${actionLabel} successfully`,
    };
  }
}