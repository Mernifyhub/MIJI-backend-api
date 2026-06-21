// src/modules/agent/services/agent-profile.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AgentProfileService {
  private readonly logger = new Logger(AgentProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        agentName: true,
        agentAddress: true,
        aviationNumber: true,
        nidCopy: true,
        tradeLicense: true,
        logo: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Path normalize করে return (Windows backslash → forward slash)
    return {
      ...user,
      logo: this.normalizePath(user.logo),
      nidCopy: this.normalizePath(user.nidCopy),
      tradeLicense: this.normalizePath(user.tradeLicense),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone !== undefined ? dto.phone.trim() : undefined,
        agentName:
          dto.agentName !== undefined ? dto.agentName.trim() : undefined,
        agentAddress:
          dto.agentAddress !== undefined
            ? dto.agentAddress.trim()
            : undefined,
        aviationNumber:
          dto.aviationNumber !== undefined
            ? dto.aviationNumber.trim()
            : undefined,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        agentName: true,
        agentAddress: true,
        aviationNumber: true,
        nidCopy: true,
        tradeLicense: true,
        logo: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ...updatedUser,
      logo: this.normalizePath(updatedUser.logo),
      nidCopy: this.normalizePath(updatedUser.nidCopy),
      tradeLicense: this.normalizePath(updatedUser.tradeLicense),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        updatedAt: new Date(),
      },
    });
  }

  async uploadDocument(
    userId: string,
    type: 'nidCopy' | 'tradeLicense' | 'logo',
    newPath: string,
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        nidCopy: true,
        tradeLicense: true,
        logo: true,
      },
    });

    if (currentUser) {
      const oldPath =
        type === 'nidCopy'
          ? currentUser.nidCopy
          : type === 'tradeLicense'
            ? currentUser.tradeLicense
            : currentUser.logo;

      // ✅ পুরনো file delete করো
      if (oldPath) {
        const cleaned = oldPath.replace(/\\/g, '/');
        const match = cleaned.match(/\/?uploads\/.+$/);
        if (match) {
          const oldFullPath = path.join(process.cwd(), match[0]);
          try {
            if (fs.existsSync(oldFullPath)) {
              fs.unlinkSync(oldFullPath);
              this.logger.log(`Deleted old file: ${oldFullPath}`);
            }
          } catch {
            this.logger.warn(`Failed to delete old file: ${oldFullPath}`);
          }
        }
      }
    }

    // ✅ Path normalize করে DB তে save
    const normalizedPath = newPath.replace(/\\/g, '/');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        [type]: normalizedPath,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Updated ${type} for user ${userId}: ${normalizedPath}`);
  }

  // ✅ Helper: Path normalize
  private normalizePath(filePath: string | null): string | null {
    if (!filePath) return null;
    
    let normalized = filePath.replace(/\\/g, '/');
    
    // Windows drive letter remove
    normalized = normalized.replace(/^[A-Za-z]:\//, '');
    
    // uploads/ থেকে শুরু না হলে fix করো
    const uploadsIdx = normalized.indexOf('uploads/');
    if (uploadsIdx !== -1) {
      normalized = '/' + normalized.slice(uploadsIdx);
    }
    
    return normalized;
  }
}