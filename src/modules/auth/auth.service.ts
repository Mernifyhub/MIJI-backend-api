import {ConflictException,ForbiddenException,Injectable,InternalServerErrorException,Logger,ServiceUnavailableException,UnauthorizedException,BadRequestException} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UploadService } from 'src/upload/upload.service';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { AgentStatus, Role } from '@prisma/client';
import { StringValue } from 'ms';

import { RegisterUserDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { OtpService } from '../otp/otp.service';

interface RegisterFilePaths {
  nidCopy: string;
  tradeLicense: string;
  logo?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly uploadService: UploadService,
    private otpService: OtpService,
  ) {}

  // ========================
  // REGISTER
  // ========================
  async register(
    registerDto: RegisterUserDto,
    filePaths: RegisterFilePaths,
  ): Promise<AuthResponseDto> {
    const {
      firstName,
      lastName,
      email,
      password,
      agentName,
      agentAddress,
      phone,
      aviationNumber,
      city,
      country,
    } = registerDto;

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      await this.cleanupFiles(filePaths);
      throw new ConflictException('Email already registered');
    }

    try {
      const hashedPassword = await bcrypt.hash(password, this.SALT_ROUNDS);
      const agentId = await this.generateAgentId();

      const user = await this.prisma.user.create({
        data: {
          agentId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          agentName: agentName.trim(),
          agentAddress: agentAddress?.trim() || '',
          phone: phone?.trim() || '',
          aviationNumber: aviationNumber?.trim() || '',
          nidCopy: filePaths.nidCopy,
          tradeLicense: filePaths.tradeLicense,
          logo: filePaths.logo || '',
          city: city?.trim() || '',
          country: country?.trim() || '',
          role: Role.USER,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          tier: true,
          agentId: true,
          agentName: true,
        },
      });

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      this.logger.log(`New user registered: ${user.email}`);

      return {
        message: 'Registration successful',
        ...tokens,
        user,
      };
    } catch (error) {
      await this.cleanupFiles(filePaths);

      if (error instanceof ConflictException) {
        throw error;
      }

      this.logger.error(
        'Registration failed',
        error instanceof Error ? error.stack : String(error),
      );

      throw new InternalServerErrorException('Registration failed');
    }
  }

  // ========================
  // LOGIN
  // ========================
// ========================
// PRIVATE: Generate Token
// ========================
private async generateToken(payload: Record<string, any>): Promise<string> {
  const secret =
    this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  const expiresIn = this.configService.getOrThrow<string>(
    'JWT_ACCESS_EXPIRATION',
  ) as StringValue;

  return this.jwtService.signAsync(payload, { secret, expiresIn });
}

// ========================
// PRIVATE: Complete SubUser Login
// ========================
private async completeSubUserLogin(subUser: any) {
  await this.prisma.subUser.update({
    where: { id: subUser.id },
    data: { lastLogin: new Date() },
  });

  const token = await this.generateToken({
    id: subUser.id,
    agentId: subUser.agentId,
    role: String(subUser.role).toUpperCase(),
    type: 'subuser',
    permissions: subUser.permissions ?? [],
  });

  this.logger.log(
    `SubUser logged in: ${subUser.email || subUser.username}`,
  );

  return {
    success: true,
    Role: String(subUser.role).toUpperCase(),
    type: 'subuser',
    redirectTo: '/user/dashboard',
    userId: subUser.id,
    userName:
      subUser.fullName ||
      subUser.username ||
      subUser.email ||
      'Sub User',
    userEmail: subUser.email || '',
    token,
  };
}

// ========================
// PRIVATE: Complete Main User Login
// ========================
private async completeUserLogin(user: any) {
  const token = await this.generateToken({
    id: user.id,
    role: String(user.role).toUpperCase(),
    type: 'agent',
  });

  let redirectTo = '/user/dashboard';
  if (user.role === Role.ADMIN) redirectTo = '/admin/dashboard';
  else if (user.role === Role.MANAGER) redirectTo = '/manager/dashboard';

  await this.prisma.user.update({
    where: { id: user.id },
    data: { lastActive: new Date() },
  });

  this.logger.log(`User logged in: ${user.email}`);

  return {
    success: true,
    Role: String(user.role).toUpperCase(),
    type: 'agent',
    redirectTo,
    userId: user.id,
    userName:
      user.agentName ||
      `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
      user.email,
    userEmail: user.email,
    token,
  };
}

// ========================
// STEP 1: LOGIN
// verify credentials
// if trusted device => direct login
// otherwise send OTP
// ========================
async login(loginDto: LoginDto & { deviceToken?: string }) {
  const { email, password, deviceToken } = loginDto;

  if (!email || !password) {
    throw new UnauthorizedException(
      'Email/username and password are required',
    );
  }

  const input = email.toLowerCase().trim();

  try {
    // ── SUBUSER LOGIN ──
    const subUser = await this.prisma.subUser.findFirst({
      where: {
        OR: [{ username: input }, { email: input }],
      },
      include: {
        agent: {
          select: { status: true, agentName: true },
        },
      },
    });

    if (subUser) {
      if (!subUser.isActive) {
        throw new ForbiddenException(
          'Your account is deactivated. Contact your agency admin.',
        );
      }

      if (
        subUser.agent?.status === AgentStatus.SUSPENDED ||
        subUser.agent?.status === AgentStatus.INACTIVE
      ) {
        throw new ForbiddenException('Agency account is suspended.');
      }

      const isMatch = await bcrypt.compare(password, subUser.password);
      if (!isMatch) {
        throw new UnauthorizedException('Invalid password');
      }

      if (!subUser.email) {
        throw new BadRequestException(
          'No email linked to this account. Cannot send OTP.',
        );
      }

      // ✅ trusted device hole OTP skip
      const isTrusted = await this.otpService.isTrustedDevice(
        subUser.email,
        deviceToken,
      );

      if (isTrusted) {
        return this.completeSubUserLogin(subUser);
      }

      // ✅ trusted na hole OTP pathao
      await this.otpService.sendOtp(subUser.email, 'LOGIN');

      return {
        success: true,
        requireOtp: true,
        email: subUser.email,
        type: 'subuser',
        message: `OTP sent to ${this.otpService.maskEmail(subUser.email)}`,
      };
    }

    // ── MAIN USER LOGIN ──
    const user = await this.prisma.user.findUnique({
      where: { email: input },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        agentId: true,
        agentName: true,
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    if (user.role === Role.USER) {
      if (
        user.status === AgentStatus.SUSPENDED ||
        user.status === AgentStatus.INACTIVE
      ) {
        throw new ForbiddenException(
          'Your account is suspended. Contact admin.',
        );
      }

      if (user.status === AgentStatus.PENDING) {
        throw new ForbiddenException('Your account is pending approval.');
      }
    }

    // ✅ trusted device hole OTP skip
    const isTrusted = await this.otpService.isTrustedDevice(
      user.email,
      deviceToken,
    );

    if (isTrusted) {
      return this.completeUserLogin(user);
    }

    // ✅ trusted na hole OTP pathao
    await this.otpService.sendOtp(user.email, 'LOGIN');

    return {
      success: true,
      requireOtp: true,
      email: user.email,
      type: 'agent',
      message: `OTP sent to ${this.otpService.maskEmail(user.email)}`,
    };
  } catch (error) {
    if (error?.status) throw error;

    this.logger.error(
      `Login failed for "${input}": ${error?.message}`,
      error?.stack,
    );

    throw new ServiceUnavailableException(
      'Service temporarily unavailable. Please try again later.',
    );
  }
}

// ========================
// STEP 2: VERIFY OTP
// verify otp
// if rememberDevice=true => create trusted device
// ========================
async verifyLoginOtp(
  dto: VerifyOtpDto & { rememberDevice?: boolean },
  userAgent?: string,
  ip?: string,
) {
  const input = dto.email.toLowerCase().trim();
  const { otp, rememberDevice } = dto;

  try {
    // ✅ first verify OTP
    await this.otpService.verifyOtp(input, otp, 'LOGIN');

    // ── SUBUSER ──
    const subUser = await this.prisma.subUser.findFirst({
      where: {
        OR: [{ username: input }, { email: input }],
      },
      include: {
        agent: {
          select: { status: true, agentName: true },
        },
      },
    });

    if (subUser) {
      if (!subUser.isActive) {
        throw new ForbiddenException(
          'Your account is deactivated. Contact your agency admin.',
        );
      }

      if (
        subUser.agent?.status === AgentStatus.SUSPENDED ||
        subUser.agent?.status === AgentStatus.INACTIVE
      ) {
        throw new ForbiddenException('Agency account is suspended.');
      }

      const result = await this.completeSubUserLogin(subUser);

      // ✅ remember device
      if (rememberDevice && subUser.email) {
        const deviceToken = await this.otpService.createTrustedDevice(
          subUser.id,
          subUser.email,
          userAgent,
          ip,
        );

        return {
          ...result,
          deviceToken,
        };
      }

      return result;
    }

    // ── MAIN USER ──
    const user = await this.prisma.user.findUnique({
      where: { email: input },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        agentId: true,
        agentName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.role === Role.USER) {
      if (
        user.status === AgentStatus.SUSPENDED ||
        user.status === AgentStatus.INACTIVE
      ) {
        throw new ForbiddenException(
          'Your account is suspended. Contact admin.',
        );
      }

      if (user.status === AgentStatus.PENDING) {
        throw new ForbiddenException('Your account is pending approval.');
      }
    }

    const result = await this.completeUserLogin(user);

    // ✅ remember device
    if (rememberDevice) {
      const deviceToken = await this.otpService.createTrustedDevice(
        user.id,
        user.email,
        userAgent,
        ip,
      );

      return {
        ...result,
        deviceToken,
      };
    }

    return result;
  } catch (error) {
    if (error?.status) throw error;

    this.logger.error(
      `OTP verify failed for "${input}": ${error?.message}`,
      error?.stack,
    );

    throw new ServiceUnavailableException(
      'Service temporarily unavailable. Please try again later.',
    );
  }
}

// ========================
// RESEND OTP
// ========================
async resendOtp(dto: ResendOtpDto) {
  const input = dto.email.toLowerCase().trim();

  try {
    await this.otpService.sendOtp(input, 'LOGIN');

    return {
      success: true,
      message: `OTP resent to ${this.otpService.maskEmail(input)}`,
    };
  } catch (error) {
    if (error?.status) throw error;

    this.logger.error(
      `Resend OTP failed for "${input}": ${error?.message}`,
      error?.stack,
    );

    throw new ServiceUnavailableException(
      'Failed to resend OTP. Please try again.',
    );
  }
}
  // ========================
  // REFRESH TOKENS
  // ========================
  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        refreshToken: true,
      },
    });

    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access denied');
    }

    if (user.status === AgentStatus.PENDING) {
      throw new ForbiddenException('Account is pending approval');
    }
    if (user.status === AgentStatus.INACTIVE) {
      throw new ForbiddenException('Account is inactive');
    }
    if (user.status === AgentStatus.SUSPENDED) {
      throw new ForbiddenException('Account is suspended');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new ForbiddenException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ========================
  // LOGOUT
  // ========================
  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  // ========================
  // GET PROFILE
  // ========================
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        agentId: true,
        email: true,
        firstName: true,
        lastName: true,
        agentName: true,
        agentAddress: true,
        phone: true,
        aviationNumber: true,
        role: true,
        status: true,
        tier: true,
        balance: true,
        creditLimit: true,
        commission: true,
        verified: true,
        logo: true,
        nidCopy: true,
        tradeLicense: true,
        city: true,
        country: true,
        createdAt: true,
        lastActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      success: true,
      user,
    };
  }

  // ========================
  // UPDATE PROFILE
  // ========================
  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      agentName?: string;
      agentAddress?: string;
      aviationNumber?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && {
          firstName: data.firstName.trim(),
        }),
        ...(data.lastName !== undefined && {
          lastName: data.lastName.trim(),
        }),
        ...(data.phone !== undefined && {
          phone: data.phone.trim(),
        }),
        ...(data.agentName !== undefined && {
          agentName: data.agentName.trim(),
        }),
        ...(data.agentAddress !== undefined && {
          agentAddress: data.agentAddress.trim(),
        }),
        ...(data.aviationNumber !== undefined && {
          aviationNumber: data.aviationNumber.trim(),
        }),
      },
      select: {
        id: true,
        agentId: true,
        email: true,
        firstName: true,
        lastName: true,
        agentName: true,
        agentAddress: true,
        phone: true,
        aviationNumber: true,
        role: true,
        status: true,
        tier: true,
        balance: true,
        creditLimit: true,
        commission: true,
        verified: true,
        logo: true,
        nidCopy: true,
        tradeLicense: true,
        city: true,
        country: true,
        createdAt: true,
        lastActive: true,
      },
    });

    return updatedUser;
  }

  // ========================
  // CHANGE PASSWORD
  // ========================
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      user.password,
    );

    if (!isOldPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        refreshToken: null,
      },
    });

    return { message: 'Password changed successfully' };
  }

  // ========================
  // UPLOAD DOCUMENT
  // ========================
  async uploadDocument(
    userId: string,
    type: 'nidCopy' | 'tradeLicense' | 'logo',
    newPath: string,
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nidCopy: true, tradeLicense: true, logo: true },
    });

    if (currentUser) {
      const oldPath =
        type === 'nidCopy'
          ? currentUser.nidCopy
          : type === 'tradeLicense'
            ? currentUser.tradeLicense
            : currentUser.logo;

      if (oldPath && !oldPath.startsWith('http') && oldPath.trim() !== '') {
        const oldFullPath = path.join(process.cwd(), oldPath);
        try {
          if (fs.existsSync(oldFullPath)) {
            fs.unlinkSync(oldFullPath);
            this.logger.log(`Deleted old file: ${oldFullPath}`);
          }
        } catch {
          this.logger.warn(`Could not delete old file: ${oldFullPath}`);
        }
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { [type]: newPath },
    });
  }

  // ========================
  // PRIVATE HELPERS
  // ========================
  private async generateTokens(
    userId: string,
    email: string,
    role: Role,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: userId, email, role };

    const accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    const accessExpiration = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRATION',
    ) as StringValue;

    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const refreshExpiration = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRATION',
    ) as StringValue;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiration,
      }),
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiration,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hashedRefreshToken = await bcrypt.hash(
      refreshToken,
      this.SALT_ROUNDS,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }

  private async generateAgentId(): Promise<string> {
  const users = await this.prisma.user.findMany({
    where: {
      role: 'USER',
      agentId: { not: null },
    },
    select: { agentId: true },
  });

  const existingNumbers = users
    .map((u) => u.agentId || '')
    .filter((id) => /^MPA\d+$/.test(id))
    .map((id) => parseInt(id.replace('MPA', ''), 10))
    .filter((n) => Number.isFinite(n));

  const max = existingNumbers.length
    ? Math.max(...existingNumbers)
    : 0;

  const next = max + 1;

  return `MPA${String(next).padStart(3, '0')}`;
}
  private async cleanupFiles(filePaths: RegisterFilePaths): Promise<void> {
    const deletePromises: Promise<unknown>[] = [];

    if (filePaths.nidCopy) {
      deletePromises.push(this.uploadService.deleteFile(filePaths.nidCopy));
    }
    if (filePaths.tradeLicense) {
      deletePromises.push(
        this.uploadService.deleteFile(filePaths.tradeLicense),
      );
    }
    if (filePaths.logo) {
      deletePromises.push(this.uploadService.deleteFile(filePaths.logo));
    }

    await Promise.allSettled(deletePromises);
  }
}