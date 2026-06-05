import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AgentTier, AgentStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminAgentService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // Helper — find by UUID or agentId (MPA001)
  // ==========================================
  private async findAgentByIdOrAgentId(id: string) {
    const agent = await this.prisma.user.findFirst({
      where: {
        role: Role.USER,
        OR: [
          { id },
          { agentId: id },
        ],
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${id}`);
    }

    return agent;
  }

  // ==========================================
  // GET ALL
  // ==========================================
  async findAll(query: {
    search?: string;
    status?: string;
    tier?: string;
    country?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(500, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const where: any = { role: Role.USER };

    if (query.status) where.status = String(query.status).toUpperCase();
    if (query.tier) where.tier = String(query.tier).toUpperCase();
    if (query.country) where.country = query.country;

    if (query.search) {
      where.OR = [
        { agentName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { agentId: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderByMap: Record<string, any> = {
      id: { createdAt: sortOrder },
      name: { firstName: sortOrder },
      balance: { balance: sortOrder },
      creditLimit: { creditLimit: sortOrder },
      country: { country: sortOrder },
    };

    const orderBy = orderByMap[query.sortBy || 'id'] || { createdAt: 'desc' };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: { bookings: true, subUsers: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const userIds = users.map((u) => u.id);

    const bookingAgg = userIds.length
      ? await this.prisma.booking.groupBy({
          by: ['agentId'],
          where: { agentId: { in: userIds } },
          _sum: { gross: true },
          _count: { id: true },
        })
      : [];

    const bookingMap = new Map(
      bookingAgg.map((b) => [
        b.agentId,
        {
          totalRevenue: Number(b._sum.gross || 0),
          totalBookings: Number(b._count.id || 0),
        },
      ]),
    );

    const agents = users.map((u) => {
      const info = bookingMap.get(u.id);
      return {
        id: u.agentId || u.id,
        internalId: u.id,
        agentId: u.agentId,
        name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        firstName: u.firstName,
        lastName: u.lastName,
        agentName: u.agentName,
        email: u.email,
        phone: u.phone,
        company: u.agentName,
        address: u.agentAddress,
        city: u.city || '',
        country: u.country || '',
        status: String(u.status || 'INACTIVE').toLowerCase(),
        balance: Number(u.balance || 0),
        creditLimit: Number(u.creditLimit || 0),
        usedLimit: Number(u.usedLimit || 0),
        totalBookings: info?.totalBookings || 0,
        totalRevenue: info?.totalRevenue || 0,
        joinedDate: u.createdAt,
        lastActive: u.lastActive,
        verified: u.verified,
        tier: String(u.tier || 'BRONZE').toLowerCase(),
        commission: Number(u.commission || 0),
        staffCount: u._count?.subUsers || 0,
        preBookingEnabled: u.preBookingEnabled || false,
      };
    });

    const [active, pending, suspended, inactive] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.USER, status: AgentStatus.ACTIVE } }),
      this.prisma.user.count({ where: { role: Role.USER, status: AgentStatus.PENDING } }),
      this.prisma.user.count({ where: { role: Role.USER, status: AgentStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { role: Role.USER, status: AgentStatus.INACTIVE } }),
    ]);

    return {
      agents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        total,
        active,
        pending,
        suspended,
        inactive,
        totalBalance: agents.reduce((sum, a) => sum + a.balance, 0),
        totalRevenue: agents.reduce((sum, a) => sum + a.totalRevenue, 0),
      },
    };
  }

  // ==========================================
  // CREATE
  // ==========================================
  async create(data: any) {
    const fullName = String(data.name || '').trim();
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ') || 'Agent';

    if (!data.email || !data.name || !data.phone || !data.company) {
      throw new BadRequestException('Name, email, phone and company are required');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new BadRequestException('Email already exists');

    const agentId = await this.generateNextAgentId();
    const hashedPassword = await bcrypt.hash('Agent@123', 12);

    const user = await this.prisma.user.create({
      data: {
        agentId,
        firstName: firstName || 'Agent',
        lastName,
        agentName: data.company || fullName,
        agentAddress: data.address || '',
        phone: data.phone || '',
        aviationNumber: `AUTO-${Date.now()}`,
        email: data.email,
        password: hashedPassword,
        role: Role.USER,
        status: AgentStatus.ACTIVE,
        tier: ((data.tier || 'BRONZE') as string).toUpperCase() as AgentTier,
        balance: 0,
        creditLimit: Number(data.creditLimit || 0),
        usedLimit: 0,
        commission: Number(data.commission || 0),
        verified: true,
        preBookingEnabled: Boolean(data.preBookingEnabled),
        city: data.city || '',
        country: data.country || '',
        nidCopy: 'pending-nid.pdf',
        tradeLicense: 'pending-license.pdf',
        logo: '',
      },
      include: {
        _count: { select: { subUsers: true, bookings: true } },
      },
    });

    return {
      agent: {
        id: user.agentId || user.id,
        internalId: user.id,
        agentId: user.agentId,
        name: `${user.firstName} ${user.lastName}`.trim(),
        firstName: user.firstName,
        lastName: user.lastName,
        agentName: user.agentName,
        email: user.email,
        phone: user.phone,
        company: user.agentName,
        address: user.agentAddress,
        city: user.city || '',
        country: user.country || '',
        status: String(user.status).toLowerCase(),
        balance: Number(user.balance || 0),
        creditLimit: Number(user.creditLimit || 0),
        usedLimit: Number(user.usedLimit || 0),
        totalBookings: 0,
        totalRevenue: 0,
        joinedDate: user.createdAt,
        lastActive: user.lastActive,
        verified: user.verified,
        tier: String(user.tier).toLowerCase(),
        commission: Number(user.commission || 0),
        staffCount: user._count.subUsers || 0,
        preBookingEnabled: user.preBookingEnabled,
      },
    };
  }

  // ==========================================
  // UPDATE
  // ==========================================
  async update(id: string, data: any) {
    // ✅ find by UUID or agentId
    const existing = await this.findAgentByIdOrAgentId(id);

    const fullName = String(data.name || '').trim();
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ') || existing.lastName;

    const updated = await this.prisma.user.update({
      where: { id: existing.id }, // ✅ always UUID
      data: {
        firstName: firstName || existing.firstName,
        lastName,
        agentName: data.company || existing.agentName,
        agentAddress: data.address ?? existing.agentAddress,
        phone: data.phone ?? existing.phone,
        email: data.email ?? existing.email,
        city: data.city ?? existing.city,
        country: data.country ?? existing.country,
        creditLimit:
          data.creditLimit !== undefined
            ? Number(data.creditLimit)
            : existing.creditLimit,
        commission:
          data.commission !== undefined
            ? Number(data.commission)
            : existing.commission,
        tier:
          data.tier !== undefined
            ? (String(data.tier).toUpperCase() as AgentTier)
            : existing.tier,
        preBookingEnabled:
          data.preBookingEnabled !== undefined
            ? Boolean(data.preBookingEnabled)
            : existing.preBookingEnabled,
      },
      include: {
        _count: { select: { bookings: true, subUsers: true } },
      },
    });

    return {
      agent: {
        id: updated.agentId || updated.id,
        internalId: updated.id,
        agentId: updated.agentId,
        name: `${updated.firstName} ${updated.lastName}`.trim(),
        firstName: updated.firstName,
        lastName: updated.lastName,
        agentName: updated.agentName,
        email: updated.email,
        phone: updated.phone,
        company: updated.agentName,
        address: updated.agentAddress,
        city: updated.city || '',
        country: updated.country || '',
        status: String(updated.status).toLowerCase(),
        balance: Number(updated.balance || 0),
        creditLimit: Number(updated.creditLimit || 0),
        usedLimit: Number(updated.usedLimit || 0),
        totalBookings: updated._count.bookings || 0,
        totalRevenue: 0,
        joinedDate: updated.createdAt,
        lastActive: updated.lastActive,
        verified: updated.verified,
        tier: String(updated.tier).toLowerCase(),
        commission: Number(updated.commission || 0),
        staffCount: updated._count.subUsers || 0,
        preBookingEnabled: updated.preBookingEnabled,
      },
    };
  }

  // ==========================================
  // DELETE
  // ==========================================
  async remove(id: string) {
    const existing = await this.findAgentByIdOrAgentId(id);
    await this.prisma.user.delete({ where: { id: existing.id } }); // ✅ UUID
    return { success: true };
  }

  // ==========================================
  // UPDATE STATUS
  // ==========================================
  async updateStatus(id: string, status: string) {
  const existing = await this.findAgentByIdOrAgentId(id);

  const updated = await this.prisma.user.update({
    where: { id: existing.id },
    data: {
      status: String(status).toUpperCase() as AgentStatus,
    },
    include: {
      _count: { select: { bookings: true, subUsers: true } },
    },
  });

  return {
    agent: {
      id: updated.agentId || updated.id,
      internalId: updated.id,
      agentId: updated.agentId,
      name: `${updated.firstName} ${updated.lastName}`.trim(),
      firstName: updated.firstName,
      lastName: updated.lastName,
      agentName: updated.agentName,
      email: updated.email,
      phone: updated.phone,
      company: updated.agentName,
      address: updated.agentAddress,
      city: updated.city || '',
      country: updated.country || '',
      status: String(updated.status).toLowerCase(),
      balance: Number(updated.balance || 0),
      creditLimit: Number(updated.creditLimit || 0),
      usedLimit: Number(updated.usedLimit || 0),
      totalBookings: updated._count.bookings || 0,
      totalRevenue: 0,
      joinedDate: updated.createdAt,
      lastActive: updated.lastActive,
      verified: updated.verified,
      tier: String(updated.tier).toLowerCase(),
      commission: Number(updated.commission || 0),
      staffCount: updated._count.subUsers || 0,
      preBookingEnabled: updated.preBookingEnabled,
    },
  };
}

  // ==========================================
  // TOGGLE PRE BOOKING
  // ==========================================
  async updatePreBooking(id: string, enabled: boolean) {
  const existing = await this.findAgentByIdOrAgentId(id);

  const updated = await this.prisma.user.update({
    where: { id: existing.id },
    data: { preBookingEnabled: enabled },
    include: {
      _count: { select: { bookings: true, subUsers: true } },
    },
  });

  return {
    agent: {
      id: updated.agentId || updated.id,
      internalId: updated.id,
      agentId: updated.agentId,
      name: `${updated.firstName} ${updated.lastName}`.trim(),
      firstName: updated.firstName,
      lastName: updated.lastName,
      agentName: updated.agentName,
      email: updated.email,
      phone: updated.phone,
      company: updated.agentName,
      address: updated.agentAddress,
      city: updated.city || '',
      country: updated.country || '',
      status: String(updated.status).toLowerCase(),
      balance: Number(updated.balance || 0),
      creditLimit: Number(updated.creditLimit || 0),
      usedLimit: Number(updated.usedLimit || 0),
      totalBookings: updated._count.bookings || 0,
      totalRevenue: 0,
      joinedDate: updated.createdAt,
      lastActive: updated.lastActive,
      verified: updated.verified,
      tier: String(updated.tier).toLowerCase(),
      commission: Number(updated.commission || 0),
      staffCount: updated._count.subUsers || 0,
      preBookingEnabled: updated.preBookingEnabled,
    },
  };
}

  // ==========================================
  // BULK ACTION
  // ==========================================
  async bulkAction(ids: string[], action: string) {
    if (!ids?.length) throw new BadRequestException('No agent ids provided');

    // ✅ resolve all ids to UUIDs
    const agents = await this.prisma.user.findMany({
      where: {
        role: Role.USER,
        OR: [
          { id: { in: ids } },
          { agentId: { in: ids } },
        ],
      },
      select: { id: true },
    });

    const uuids = agents.map((a) => a.id);

    if (action === 'delete') {
      const res = await this.prisma.user.deleteMany({
        where: { id: { in: uuids }, role: Role.USER },
      });
      return { success: true, count: res.count };
    }

    if (action === 'activate' || action === 'suspend') {
      const status = action === 'activate' ? AgentStatus.ACTIVE : AgentStatus.SUSPENDED;
      const res = await this.prisma.user.updateMany({
        where: { id: { in: uuids }, role: Role.USER },
        data: { status },
      });
      return { success: true, count: res.count };
    }

    throw new BadRequestException('Invalid bulk action');
  }

  // ==========================================
  // GENERATE AGENT ID
  // ==========================================
  async generateNextAgentId() {
    const users = await this.prisma.user.findMany({
      where: { role: Role.USER, agentId: { not: null } },
      select: { agentId: true },
    });

    const existingNumbers = users
      .map((u) => u.agentId || '')
      .filter((id) => /^MPA\d+$/.test(id))
      .map((id) => parseInt(id.replace('MPA', ''), 10))
      .filter((n) => Number.isFinite(n));

    const max = existingNumbers.length ? Math.max(...existingNumbers) : 0;
    const next = max + 1;

    return `MPA${String(next).padStart(3, '0')}`;
  }
}