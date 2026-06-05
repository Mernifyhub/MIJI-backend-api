import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import { AdminNotificationService } from 'src/modules/admin/services/admin-notification.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: AdminNotificationService,
  ) {}

  // ── GET all deposits ──
  async getDeposits(userId: string) {
    const deposits = await this.prisma.deposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const approved = deposits.filter((d) => d.status === 'SUCCESS');
    const pending = deposits.filter((d) => d.status === 'PENDING');

    return {
      deposits: deposits.map((d) => ({
        id: d.id,
        amount: Number(d.amount),
        currency: d.currency,
        method: d.method,
        status: d.status,
        transactionId: d.transactionId,
        reference: d.reference,
        notes: d.notes,
        attachment: d.attachment,
        approvedAt: d.approvedAt,
        rejectedAt: d.rejectedAt,
        rejectionNote: d.rejectionNote,
        createdAt: d.createdAt,
      })),
      stats: {
        totalDeposits: approved.reduce((s, d) => s + Number(d.amount), 0),
        pendingCount: pending.length,
        pendingAmount: pending.reduce((s, d) => s + Number(d.amount), 0),
        approvedCount: approved.length,
        approvedAmount: approved.reduce((s, d) => s + Number(d.amount), 0),
      },
    };
  }

  // ── CREATE deposit ──
  async createDeposit(
    userId: string,
    dto: CreateDepositDto,
    file?: Express.Multer.File,
  ) {
    // ── Check user exists ──
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        agentName: true,
        email: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // ── Handle file ──
    let attachmentUrl: string | null = null;

    if (file) {
      const normalized = file.path.replace(/\\/g, '/');
      attachmentUrl = normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;

      this.logger.log(`Receipt uploaded: ${attachmentUrl}`);
    }

    // ── Generate unique reference ──
    const reference = `DEP-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;

    // ── Create deposit ──
    const deposit = await this.prisma.deposit.create({
      data: {
        userId,
        amount: dto.amount,
        currency: 'SAR',
        method: dto.method as any,
        status: 'PENDING',
        transactionId: dto.transactionId?.trim() || null,
        reference,
        notes: dto.notes?.trim() || null,
        attachment: attachmentUrl,
      },
    });

    // ── Notify admins/managers ──
    const agentName =
      user.agentName?.trim() ||
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
      user.email ||
      'Unknown Agent';

    try {
      await this.notificationService.notifyNewDeposit(
        agentName,
        Number(dto.amount),
        'SAR',
      );

      this.logger.log(
        `Deposit notification sent for ${agentName} | ${reference}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send deposit notification for ${reference}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return {
      message: 'Deposit request submitted successfully',
      deposit: {
        id: deposit.id,
        amount: Number(deposit.amount),
        method: deposit.method,
        status: deposit.status,
        reference: deposit.reference,
        attachment: deposit.attachment,
        createdAt: deposit.createdAt,
      },
    };
  }

  // ── GET single deposit ──
  async getDepositById(userId: string, depositId: string) {
    const deposit = await this.prisma.deposit.findFirst({
      where: { id: depositId, userId },
    });

    if (!deposit) {
      throw new NotFoundException('Deposit not found');
    }

    return {
      id: deposit.id,
      amount: Number(deposit.amount),
      currency: deposit.currency,
      method: deposit.method,
      status: deposit.status,
      transactionId: deposit.transactionId,
      reference: deposit.reference,
      notes: deposit.notes,
      attachment: deposit.attachment,
      approvedAt: deposit.approvedAt,
      rejectedAt: deposit.rejectedAt,
      rejectionNote: deposit.rejectionNote,
      createdAt: deposit.createdAt,
    };
  }

  // ── Delete old file helper ──
  private deleteOldFile(filePath: string) {
    if (!filePath) return;

    const cleanPath = filePath.startsWith('/')
      ? filePath.slice(1)
      : filePath;

    const fullPath = path.join(process.cwd(), cleanPath);

    try {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        this.logger.log(`Deleted old file: ${fullPath}`);
      }
    } catch {
      this.logger.warn(`Could not delete file: ${fullPath}`);
    }
  }
}