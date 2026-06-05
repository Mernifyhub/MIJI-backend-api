// src/modules/admin/services/admin-notification.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export type AdminNotificationType =
  | 'deposit'
  | 'deposit_approved'
  | 'deposit_rejected'
  | 'booking'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_refunded'
  | 'booking_import'
  | 'agent_registered'
  | 'agent_approved'
  | 'agent_suspended'
  | 'issue_request'
  | 'reissue_request'
  | 'cancel_request'
  | 'void_request'
  | 'refund_request'
  | 'balance_alert'
  | 'credit_limit'
  | 'manual_operation'
  | 'system'
  | 'alert'
  | 'approval';

@Injectable()
export class AdminNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════
  // GET ALL NOTIFICATIONS (Admin/Manager)
  // ══════════════════════════════════════
  async getAll(
    userId: string,
    page: number,
    limit: number,
    filters?: {
      type?: string;
      read?: string;
      search?: string;
    },
  ) {
    const skip = (page - 1) * limit;

    // ✅ Build where clause
    const where: any = { userId };

    if (filters?.type && filters.type !== 'all') {
      where.type = filters.type;
    }

    if (filters?.read === 'true') {
      where.read = true;
    } else if (filters?.read === 'false') {
      where.read = false;
    }

    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { message: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [notifications, total, unreadCount, typeStats] =
      await Promise.all([
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({
          where: { userId, read: false },
        }),
        // ✅ Type wise count
        this.prisma.notification.groupBy({
          by: ['type'],
          where: { userId },
          _count: { type: true },
        }),
      ]);

    return {
      success: true,
      data: notifications.map((n) => this.formatNotification(n)),
      meta: {
        total,
        unreadCount,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        typeStats: typeStats.map((t) => ({
          type: t.type,
          count: t._count.type,
        })),
      },
    };
  }

  // ══════════════════════════════════════
  // GET UNREAD COUNT
  // ══════════════════════════════════════
  async getUnreadCount(userId: string) {
    const [total, byType] = await Promise.all([
      this.prisma.notification.count({
        where: { userId, read: false },
      }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where: { userId, read: false },
        _count: { type: true },
      }),
    ]);

    return {
      success: true,
      unreadCount: total,
      byType: byType.map((t) => ({
        type: t.type,
        count: t._count.type,
      })),
    };
  }

  // ══════════════════════════════════════
  // GET RECENT (TopBar dropdown — last 10)
  // ══════════════════════════════════════
  async getRecent(userId: string) {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.notification.count({
        where: { userId, read: false },
      }),
    ]);

    return {
      success: true,
      data: notifications.map((n) => this.formatNotification(n)),
      unreadCount,
    };
  }

  // ══════════════════════════════════════
  // MARK SINGLE AS READ
  // ══════════════════════════════════════
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    return {
      success: true,
      message: 'Marked as read',
      data: this.formatNotification(updated),
    };
  }

  // ══════════════════════════════════════
  // MARK ALL AS READ
  // ══════════════════════════════════════
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    return {
      success: true,
      message: `${result.count} notifications marked as read`,
      count: result.count,
    };
  }

  // ══════════════════════════════════════
  // DELETE SINGLE
  // ══════════════════════════════════════
  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { success: true, message: 'Notification deleted' };
  }

  // ══════════════════════════════════════
  // CLEAR ALL
  // ══════════════════════════════════════
  async clearAll(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });

    return {
      success: true,
      message: `${result.count} notifications cleared`,
      count: result.count,
    };
  }

  // ══════════════════════════════════════════════════════
  // ↓↓↓ NOTIFICATION CREATORS — other services call these ↓↓↓
  // ══════════════════════════════════════════════════════

  // ── Generic create ──
  async create(data: {
    userId: string;
    type: AdminNotificationType;
    title: string;
    message: string;
    action?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        action: data.action || null,
        read: false,
      },
    });

    return this.formatNotification(notification);
  }

  // ── Notify all admins & managers ──
  async notifyAdminsAndManagers(data: {
    type: AdminNotificationType;
    title: string;
    message: string;
    action?: string;
  }) {
    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER'] },
      },
      select: { id: true },
    });

    if (admins.length === 0) return [];

    const notifications = await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: data.type,
        title: data.title,
        message: data.message,
        action: data.action || null,
        read: false,
      })),
    });

    return { count: notifications.count };
  }

  // ══════════════════════════════════════
  // PRE-BUILT NOTIFICATION HELPERS
  // ══════════════════════════════════════

  // ── New Agent Registered ──
  async notifyNewAgentRegistered(agentName: string, agentId: string) {
    return this.notifyAdminsAndManagers({
      type: 'agent_registered',
      title: '🆕 New Agent Registration',
      message: `${agentName} (${agentId}) has registered and awaiting approval`,
      action: '/admin/agent/pending-agent',
    });
  }

  // ── Agent Approved ──
  async notifyAgentApproved(
    agentUserId: string,
    agentName: string,
  ) {
    // Notify agent
    await this.create({
      userId: agentUserId,
      type: 'agent_approved',
      title: '✅ Account Approved',
      message: `Your account has been approved. You can now start booking.`,
      action: '/dashboard',
    });

    // Notify admins
    return this.notifyAdminsAndManagers({
      type: 'agent_approved',
      title: '✅ Agent Approved',
      message: `${agentName} has been approved`,
      action: '/admin/agent/all-agent',
    });
  }

  // ── Agent Suspended ──
  async notifyAgentSuspended(
    agentUserId: string,
    agentName: string,
    reason?: string,
  ) {
    await this.create({
      userId: agentUserId,
      type: 'agent_suspended',
      title: '⚠️ Account Suspended',
      message: `Your account has been suspended. ${reason || 'Contact admin for details.'}`,
    });

    return this.notifyAdminsAndManagers({
      type: 'agent_suspended',
      title: '⚠️ Agent Suspended',
      message: `${agentName} has been suspended. ${reason || ''}`,
      action: '/admin/agent/all-agent',
    });
  }

  // ── New Deposit Request ──
  async notifyNewDeposit(
    agentName: string,
    amount: number,
    currency: string,
  ) {
    return this.notifyAdminsAndManagers({
      type: 'deposit',
      title: '💰 New Deposit Request',
      message: `${agentName} requested ${currency} ${amount.toLocaleString()} deposit`,
      action: '/admin/agent/agent-deposit-list',
    });
  }

  // ── Deposit Approved ──
  async notifyDepositApproved(
    agentUserId: string,
    amount: number,
    currency: string,
  ) {
    return this.create({
      userId: agentUserId,
      type: 'deposit_approved',
      title: '✅ Deposit Approved',
      message: `Your deposit of ${currency} ${amount.toLocaleString()} has been approved and added to your balance`,
      action: '/dashboard',
    });
  }

  // ── Deposit Rejected ──
  async notifyDepositRejected(
    agentUserId: string,
    amount: number,
    currency: string,
    reason?: string,
  ) {
    return this.create({
      userId: agentUserId,
      type: 'deposit_rejected',
      title: '❌ Deposit Rejected',
      message: `Your deposit of ${currency} ${amount.toLocaleString()} was rejected. ${reason || ''}`,
    });
  }

  // ── New Booking Created ──
  async notifyNewBooking(
    agentUserId: string,
    agentName: string,
    bookingId: string,
    pnr: string,
    route: string,
    amount: number,
  ) {
    // Notify agent
    await this.create({
      userId: agentUserId,
      type: 'booking',
      title: '🎫 Booking Created',
      message: `Booking ${bookingId} | PNR: ${pnr} | ${route} | SAR ${amount.toLocaleString()}`,
      action: `/bookings/${bookingId}`,
    });

    // Notify admins
    return this.notifyAdminsAndManagers({
      type: 'booking',
      title: '🎫 New Booking',
      message: `${agentName} created booking ${bookingId} | PNR: ${pnr} | ${route} | SAR ${amount.toLocaleString()}`,
      action: '/admin/bookings',
    });
  }

  // ── Booking Confirmed / Issued ──
  async notifyBookingConfirmed(
    agentUserId: string,
    bookingId: string,
    pnr: string,
  ) {
    return this.create({
      userId: agentUserId,
      type: 'booking_confirmed',
      title: '✅ Booking Confirmed',
      message: `Booking ${bookingId} (PNR: ${pnr}) has been confirmed and ticket issued`,
      action: `/bookings/${bookingId}`,
    });
  }

  // ── Booking Cancelled ──
  async notifyBookingCancelled(
    agentUserId: string,
    agentName: string,
    bookingId: string,
    pnr: string,
  ) {
    await this.create({
      userId: agentUserId,
      type: 'booking_cancelled',
      title: '❌ Booking Cancelled',
      message: `Booking ${bookingId} (PNR: ${pnr}) has been cancelled`,
      action: `/bookings/${bookingId}`,
    });

    return this.notifyAdminsAndManagers({
      type: 'booking_cancelled',
      title: '❌ Booking Cancelled',
      message: `${agentName}'s booking ${bookingId} (PNR: ${pnr}) cancelled`,
      action: '/admin/bookings',
    });
  }

  // ── Booking Refunded ──
  async notifyBookingRefunded(
    agentUserId: string,
    bookingId: string,
    pnr: string,
    refundAmount: number,
  ) {
    return this.create({
      userId: agentUserId,
      type: 'booking_refunded',
      title: '💸 Refund Processed',
      message: `Booking ${bookingId} (PNR: ${pnr}) refunded SAR ${refundAmount.toLocaleString()}`,
      action: `/bookings/${bookingId}`,
    });
  }

  // ── GDS Import Booking ──
  async notifyBookingImported(
    agentUserId: string,
    agentName: string,
    bookingId: string,
    pnr: string,
    route: string,
  ) {
    await this.create({
      userId: agentUserId,
      type: 'booking_import',
      title: '📥 Booking Imported',
      message: `Booking ${bookingId} | PNR: ${pnr} | ${route} imported from GDS`,
      action: `/bookings/${bookingId}`,
    });

    return this.notifyAdminsAndManagers({
      type: 'booking_import',
      title: '📥 GDS Booking Imported',
      message: `${agentName}'s booking imported — ${bookingId} | PNR: ${pnr} | ${route}`,
      action: '/admin/bookings',
    });
  }

  // ── Issue / Reissue / Cancel / Void / Refund Request ──
  async notifyBookingRequest(
    agentName: string,
    requestType: string,
    bookingId: string,
    pnr: string,
  ) {
    const typeMap: Record<string, { type: AdminNotificationType; emoji: string }> = {
      ISSUE: { type: 'issue_request', emoji: '🎫' },
      REISSUE: { type: 'reissue_request', emoji: '🔄' },
      CANCEL: { type: 'cancel_request', emoji: '❌' },
      VOID: { type: 'void_request', emoji: '🚫' },
      REFUND: { type: 'refund_request', emoji: '💸' },
    };

    const config = typeMap[requestType.toUpperCase()] || {
      type: 'booking' as AdminNotificationType,
      emoji: '📋',
    };

    return this.notifyAdminsAndManagers({
      type: config.type,
      title: `${config.emoji} ${requestType} Request`,
      message: `${agentName} requested ${requestType.toLowerCase()} for booking ${bookingId} (PNR: ${pnr})`,
      action: '/admin/bookings',
    });
  }

  // ── Balance Low Alert ──
  async notifyBalanceAlert(
    agentUserId: string,
    agentName: string,
    currentBalance: number,
  ) {
    await this.create({
      userId: agentUserId,
      type: 'balance_alert',
      title: '⚠️ Low Balance Alert',
      message: `Your balance is low: SAR ${currentBalance.toLocaleString()}. Please add funds to continue booking.`,
      action: '/deposit',
    });

    return this.notifyAdminsAndManagers({
      type: 'balance_alert',
      title: '⚠️ Agent Low Balance',
      message: `${agentName}'s balance is low: SAR ${currentBalance.toLocaleString()}`,
      action: '/admin/agent/all-agent',
    });
  }

  // ── Credit Limit Changed ──
  async notifyCreditLimitChanged(
    agentUserId: string,
    agentName: string,
    oldLimit: number,
    newLimit: number,
  ) {
    await this.create({
      userId: agentUserId,
      type: 'credit_limit',
      title: '💳 Credit Limit Updated',
      message: `Your credit limit changed from SAR ${oldLimit.toLocaleString()} to SAR ${newLimit.toLocaleString()}`,
    });

    return this.notifyAdminsAndManagers({
      type: 'credit_limit',
      title: '💳 Credit Limit Changed',
      message: `${agentName}'s limit: SAR ${oldLimit.toLocaleString()} → SAR ${newLimit.toLocaleString()}`,
      action: '/admin/agent/all-agent',
    });
  }

  // ── Manual Operation ──
  async notifyManualOperation(
    agentUserId: string,
    agentName: string,
    operationType: string,
    amount: number,
    description: string,
  ) {
    await this.create({
      userId: agentUserId,
      type: 'manual_operation',
      title: `📝 Account ${operationType === 'credit' ? 'Credited' : 'Debited'}`,
      message: `SAR ${amount.toLocaleString()} ${operationType === 'credit' ? 'added to' : 'deducted from'} your account. ${description}`,
    });

    return this.notifyAdminsAndManagers({
      type: 'manual_operation',
      title: `📝 Manual ${operationType}`,
      message: `${agentName}: SAR ${amount.toLocaleString()} ${operationType}. ${description}`,
      action: '/admin/manual-operations',
    });
  }

  // ── System Alert ──
  async notifySystemAlert(title: string, message: string) {
    return this.notifyAdminsAndManagers({
      type: 'system',
      title: `🔔 ${title}`,
      message,
    });
  }

  // ══════════════════════════════════════
  // FORMAT & HELPERS
  // ══════════════════════════════════════
  private formatNotification(n: any) {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      action: n.action,
      read: n.read,
      readAt: n.readAt,
      time: this.getRelativeTime(n.createdAt),
      createdAt: n.createdAt,
    };
  }

  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = Math.floor(
      (now.getTime() - new Date(date).getTime()) / 1000,
    );

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} day ago`;
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
  }
}