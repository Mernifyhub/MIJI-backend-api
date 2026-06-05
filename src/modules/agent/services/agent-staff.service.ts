import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import * as bcrypt from 'bcryptjs';

const PERMISSION_META: Record<
  string,
  { label: string; description: string; category: string }
> = {
  'dashboard.view': {
    label: 'View Dashboard',
    description: 'Can access the main dashboard',
    category: 'Dashboard',
  },
  'search.flights': {
    label: 'Search Flights',
    description: 'Can search and view flight results',
    category: 'Search Flights',
  },
  'bookings.view': {
    label: 'View Bookings',
    description: 'Can view all booking lists',
    category: 'My Booking',
  },
  'bookings.create': {
    label: 'Create Bookings',
    description: 'Can create new flight bookings',
    category: 'My Booking',
  },
  'bookings.cancel': {
    label: 'Cancel Bookings',
    description: 'Can cancel existing bookings',
    category: 'My Booking',
  },
  'bookings.void': {
    label: 'Void Bookings',
    description: 'Can void ticketed bookings',
    category: 'My Booking',
  },
  'bookings.refund': {
    label: 'Refund Bookings',
    description: 'Can request booking refunds',
    category: 'My Booking',
  },
  'deposits.view': {
    label: 'View Deposits',
    description: 'Can view deposit list and history',
    category: 'My Deposit',
  },
  'deposits.create': {
    label: 'Create Deposits',
    description: 'Can create new deposit requests',
    category: 'My Deposit',
  },
  'staff.view': {
    label: 'View Staff',
    description: 'Can view staff/sub-user list',
    category: 'My Staff',
  },
  'staff.manage': {
    label: 'Manage Staff',
    description: 'Can create, edit, delete sub-users',
    category: 'My Staff',
  },
  'profile.view': {
    label: 'View Profile',
    description: 'Can view account profile info',
    category: 'My Account',
  },
  'profile.edit': {
    label: 'Edit Profile',
    description: 'Can edit profile & change password',
    category: 'My Account',
  },
  'reports.sales': {
    label: 'Sales Report',
    description: 'Can view sales report',
    category: 'Sale Report',
  },
  'reports.ledger': {
    label: 'Account Ledger',
    description: 'Can view account ledger',
    category: 'Sale Report',
  },
  'reports.all': {
    label: 'All Reports',
    description: 'Can view all reports',
    category: 'Sale Report',
  },
};

const formatPermissions = (enabledKeys: string[]) =>
  Object.entries(PERMISSION_META).map(([key, meta]) => ({
    key,
    ...meta,
    enabled: enabledKeys.includes(key),
  }));

const filterValidPermissions = (perms: string[]): string[] =>
  perms.filter((p) => PERMISSION_META[p]);

@Injectable()
export class AgentStaffService {
  private readonly logger = new Logger(AgentStaffService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── GET ALL ──
  async getAll(agentId: string) {
    const subUsers = await this.prisma.subUser.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = subUsers.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName ?? null,
      email: u.email ?? null,
      phone: u.phone ?? null,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      lastLogin: u.lastLogin?.toISOString() ?? null,
      depositsCreated: u.depositsCreated,
      withdrawalsCreated: u.withdrawalsCreated,
      permissions: formatPermissions(u.permissions ?? []),
    }));

    return {
      subUsers: formatted,
      stats: {
        total: subUsers.length,
        active: subUsers.filter((u) => u.isActive).length,
        inactive: subUsers.filter((u) => !u.isActive).length,
      },
    };
  }

  // ── CREATE ──
  async create(agentId: string, dto: CreateStaffDto) {
    const username = dto.username.toLowerCase().trim();

    // Check username unique
    const exists = await this.prisma.subUser.findUnique({
      where: { username },
    });

    if (exists) {
      throw new ConflictException('Username already taken');
    }

    const validPermissions = dto.permissions
      ? filterValidPermissions(dto.permissions)
      : [];

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const subUser = await this.prisma.subUser.create({
      data: {
        username,
        password: hashedPassword,
        role: dto.role as any,
        fullName: dto.fullName?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        permissions: validPermissions,
        agentId,
        isActive: true,
      },
    });

    this.logger.log(`Staff created: ${username} for agent: ${agentId}`);

    return {
      success: true,
      subUser: {
        id: subUser.id,
        username: subUser.username,
        role: subUser.role,
        isActive: subUser.isActive,
        createdAt: subUser.createdAt.toISOString(),
        lastLogin: null,
        permissions: formatPermissions(subUser.permissions ?? []),
      },
    };
  }

  // ── UPDATE ──
  async update(agentId: string, staffId: string, dto: UpdateStaffDto) {
    const subUser = await this.prisma.subUser.findFirst({
      where: { id: staffId, agentId },
    });

    if (!subUser) {
      throw new NotFoundException('Staff member not found');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.role) updateData.role = dto.role;
    if (typeof dto.isActive === 'boolean') updateData.isActive = dto.isActive;
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 12);
    }
    if (dto.fullName !== undefined)
      updateData.fullName = dto.fullName?.trim() || null;
    if (dto.email !== undefined)
      updateData.email = dto.email?.trim() || null;
    if (dto.phone !== undefined)
      updateData.phone = dto.phone?.trim() || null;
    if (dto.permissions) {
      updateData.permissions = filterValidPermissions(dto.permissions);
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    const updated = await this.prisma.subUser.update({
      where: { id: staffId },
      data: updateData,
    });

    return {
      success: true,
      subUser: {
        id: updated.id,
        username: updated.username,
        fullName: updated.fullName ?? null,
        email: updated.email ?? null,
        phone: updated.phone ?? null,
        role: updated.role,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        lastLogin: updated.lastLogin?.toISOString() ?? null,
        depositsCreated: updated.depositsCreated,
        withdrawalsCreated: updated.withdrawalsCreated,
        permissions: formatPermissions(updated.permissions ?? []),
      },
    };
  }

  // ── DELETE ──
  async delete(agentId: string, staffId: string) {
    const subUser = await this.prisma.subUser.findFirst({
      where: { id: staffId, agentId },
    });

    if (!subUser) {
      throw new NotFoundException('Staff member not found');
    }

    await this.prisma.subUser.delete({ where: { id: staffId } });

    this.logger.log(`Staff deleted: ${subUser.username}`);

    return { success: true };
  }
}