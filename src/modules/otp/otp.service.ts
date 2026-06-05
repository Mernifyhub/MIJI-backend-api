import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  // ── Generate 6-digit OTP ──
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Generate secure random token ──
  private generateDeviceToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  // ── Mask email ──
  maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!name || !domain) return '***@***.***';
    const masked =
      name.length <= 2
        ? '*'.repeat(name.length)
        : name[0] +
          '*'.repeat(Math.max(name.length - 2, 1)) +
          name[name.length - 1];
    return `${masked}@${domain}`;
  }

  // ══════════════════════════════════
  // TRUSTED DEVICE — check
  // ══════════════════════════════════
  async isTrustedDevice(
    email: string,
    deviceToken?: string,
  ): Promise<boolean> {
    if (!deviceToken) return false;

    const trusted = await this.prisma.trustedDevice.findFirst({
      where: {
        email,
        token: deviceToken,
        expiresAt: { gt: new Date() },
      },
    });

    if (trusted) {
      this.logger.log(`Trusted device found for ${email}`);
      return true;
    }

    return false;
  }

  // ══════════════════════════════════
  // TRUSTED DEVICE — create
  // ══════════════════════════════════
  async createTrustedDevice(
    userId: string,
    email: string,
    userAgent?: string,
    ip?: string,
  ): Promise<string> {
    const hours = this.config.get<number>('TRUSTED_DEVICE_HOURS', 12);
    const token = this.generateDeviceToken();

    // ek user er max 5 ta trusted device thakbe
    const existingCount = await this.prisma.trustedDevice.count({
      where: { userId },
    });

    if (existingCount >= 5) {
      // purono gulo delete koro
      const oldest = await this.prisma.trustedDevice.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: existingCount - 4,
      });

      await this.prisma.trustedDevice.deleteMany({
        where: { id: { in: oldest.map((d) => d.id) } },
      });
    }

    await this.prisma.trustedDevice.create({
      data: {
        userId,
        email,
        token,
        userAgent: userAgent?.slice(0, 500),
        ip,
        expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      },
    });

    this.logger.log(
      `Trusted device created for ${email} (${hours}h)`,
    );

    return token;
  }

  // ══════════════════════════════════
  // TRUSTED DEVICE — remove (logout e use hobe)
  // ══════════════════════════════════
  async removeTrustedDevice(deviceToken: string): Promise<void> {
    await this.prisma.trustedDevice.deleteMany({
      where: { token: deviceToken },
    });
  }

  // ══════════════════════════════════
  // TRUSTED DEVICE — cleanup expired
  // ══════════════════════════════════
  async cleanupExpiredDevices(): Promise<void> {
    const result = await this.prisma.trustedDevice.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleaned up ${result.count} expired trusted devices`,
      );
    }
  }

  // ══════════════════════════════════
  // SEND OTP
  // ══════════════════════════════════
  async sendOtp(email: string, type = 'LOGIN'): Promise<void> {
    const expiryMinutes = this.config.get<number>('OTP_EXPIRY_MINUTES', 5);

    // Rate limit: max 3 per 10 min
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await this.prisma.otp.count({
      where: {
        email,
        type,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentCount >= 3) {
      throw new HttpException(
        'Too many OTP requests. Please wait 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Delete old OTPs
    await this.prisma.otp.deleteMany({
      where: { email, type },
    });

    const code = this.generateCode();

    await this.prisma.otp.create({
      data: {
        email,
        code,
        type,
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
      },
    });

    try {
      await this.mail.sendOtp(email, code);
    } catch {
      await this.prisma.otp.deleteMany({ where: { email, type } });
      throw new ServiceUnavailableException(
        'Failed to send OTP. Please try again.',
      );
    }

    this.logger.log(`OTP sent → ${email} [${type}]`);
  }

  // ══════════════════════════════════
  // VERIFY OTP
  // ══════════════════════════════════
  async verifyOtp(
    email: string,
    code: string,
    type = 'LOGIN',
  ): Promise<boolean> {
    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 5);

    const otp = await this.prisma.otp.findFirst({
      where: { email, type, verified: false },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException(
        'No OTP found. Please request a new one.',
      );
    }

    if (otp.expiresAt < new Date()) {
      await this.prisma.otp.delete({ where: { id: otp.id } });
      throw new BadRequestException(
        'OTP has expired. Please request a new one.',
      );
    }

    if (otp.attempts >= maxAttempts) {
      await this.prisma.otp.delete({ where: { id: otp.id } });
      throw new BadRequestException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    if (otp.code !== code.trim()) {
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });

      const remaining = maxAttempts - otp.attempts - 1;
      throw new BadRequestException(
        `Invalid OTP. ${remaining} attempt(s) remaining.`,
      );
    }

    await this.prisma.otp.delete({ where: { id: otp.id } });
    this.logger.log(`OTP verified → ${email} [${type}]`);
    return true;
  }
}