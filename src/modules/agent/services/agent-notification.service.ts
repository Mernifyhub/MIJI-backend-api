import {Injectable,NotFoundException,ForbiddenException,} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

export type NotificationType =| "deposit"| "booking"| "alert"| "system"| "approval";

@Injectable()
export class AgentNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // ✅ Get all notifications with pagination
  async getAll(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({
        where: { userId, read: false },
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
      },
    };
  }

  // ✅ Get unread count only
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { success: true, unreadCount: count };
  }

  // ✅ Mark single notification as read
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });

    return {
      success: true,
      message: "Marked as read",
      data: this.formatNotification(updated),
    };
  }

  // ✅ Mark all notifications as read
  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });

    return {
      success: true,
      message: "All notifications marked as read",
    };
  }

  // ✅ Delete single notification
  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    await this.prisma.notification.delete({ where: { id } });

    return { success: true, message: "Notification deleted" };
  }

  // ✅ Clear all notifications
  async clearAll(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId } });
    return { success: true, message: "All notifications cleared" };
  }

  // ✅ Create notification (internal use — other services call this)
  async createNotification({
    userId,
    type,
    title,
    message,
    action,
  }: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    action?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        action: action || null,
        read: false,
      },
    });

    return this.formatNotification(notification);
  }

  // ✅ Format response
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

  // ✅ Relative time helper
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);

    if (diff < 60) return `${diff} sec ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hour ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} day ago`;
    return new Date(date).toLocaleDateString();
  }
}