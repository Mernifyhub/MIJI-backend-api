// src/modules/admin/services/admin-markup.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMarkupDto } from '../dto/markup/create-markup.dto';
import { UpdateMarkupDto } from '../dto/markup/update-markup.dto';

@Injectable()
export class AdminMarkupService {
  private readonly logger = new Logger(AdminMarkupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── List all markups ──
  async findAll(query: {
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, query.limit || 50);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.type) {
      where.type = query.type;
    }

    if (query.search) {
      where.OR = [
        { airlineCode: { contains: query.search, mode: 'insensitive' } },
        { airlineName: { contains: query.search, mode: 'insensitive' } },
        { origin: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { note: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [markups, total] = await Promise.all([
      this.prisma.markup.findMany({
        where,
        include: {
          agent: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              agentName: true,
              email: true,
            },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.markup.count({ where }),
    ]);

    return {
      markups,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Get single ──
  async findOne(id: string) {
    const markup = await this.prisma.markup.findUnique({
      where: { id },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
            email: true,
          },
        },
      },
    });

    if (!markup) {
      throw new NotFoundException(`Markup ${id} not found`);
    }

    return markup;
  }

  // ── Create ──
  async create(dto: CreateMarkupDto) {
    if (!dto.markupAmount && !dto.markupPercent) {
      throw new BadRequestException(
        'Either markupAmount or markupPercent is required',
      );
    }

    const markup = await this.prisma.markup.create({
      data: {
        type: dto.type as any,
        airlineCode: dto.airlineCode || null,
        airlineName: dto.airlineName || null,
        origin: dto.origin || null,
        destination: dto.destination || null,
        routeMatchType: (dto.routeMatchType || 'EXACT') as any,
        agentId: dto.agentId || null,
        markupAmount: dto.markupAmount ?? 0,
        markupPercent: dto.markupPercent ?? 0,
        markupOn: (dto.markupOn || 'BASE_FARE') as any,
        markupCurrency: dto.markupCurrency || 'SAR',
        isActive: dto.isActive !== false,
        priority: dto.priority ?? 0,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        note: dto.note || null,
        createdById: dto.createdById || null,
      },
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
          },
        },
      },
    });

    this.logger.log(`Markup created: ${markup.id} type=${markup.type}`);
    return markup;
  }

  // ── Update ──
  async update(id: string, dto: UpdateMarkupDto) {
    await this.findOne(id);

    const updateData: any = {};

    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.airlineCode !== undefined) updateData.airlineCode = dto.airlineCode || null;
    if (dto.airlineName !== undefined) updateData.airlineName = dto.airlineName || null;
    if (dto.origin !== undefined) updateData.origin = dto.origin || null;
    if (dto.destination !== undefined) updateData.destination = dto.destination || null;
    if (dto.routeMatchType !== undefined) updateData.routeMatchType = dto.routeMatchType;
    if (dto.agentId !== undefined) updateData.agentId = dto.agentId || null;
    if (dto.markupAmount !== undefined) updateData.markupAmount = dto.markupAmount;
    if (dto.markupPercent !== undefined) updateData.markupPercent = dto.markupPercent;
    if (dto.markupOn !== undefined) updateData.markupOn = dto.markupOn;
    if (dto.markupCurrency !== undefined) updateData.markupCurrency = dto.markupCurrency;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.validFrom !== undefined) updateData.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validTo !== undefined) updateData.validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (dto.note !== undefined) updateData.note = dto.note || null;
    if (dto.updatedById !== undefined) updateData.updatedById = dto.updatedById || null;

    const markup = await this.prisma.markup.update({
      where: { id },
      data: updateData,
      include: {
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            agentName: true,
          },
        },
      },
    });

    this.logger.log(`Markup updated: ${id}`);
    return markup;
  }

  // ── Delete ──
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.markup.delete({ where: { id } });
    this.logger.log(`Markup deleted: ${id}`);
    return { success: true, message: 'Deleted successfully' };
  }

  // ── Toggle active ──
  async toggle(id: string, userId?: string) {
    const existing = await this.findOne(id);
    const newStatus = !existing.isActive;

    const markup = await this.prisma.markup.update({
      where: { id },
      data: {
        isActive: newStatus,
        updatedById: userId || null,
      },
    });

    this.logger.log(
      `Markup ${id} toggled to ${newStatus ? 'active' : 'inactive'}`,
    );

    return {
      markup,
      message: newStatus ? 'Markup activated' : 'Markup deactivated',
    };
  }

  // ── Calculate markup ──
  async calculate(body: {
    baseFare: number;
    totalFare?: number;
    currency?: string;
    airlineCode?: string;
    origin?: string;
    destination?: string;
    agentId?: string;
  }) {
    const now = new Date();
    const o = body.origin?.toUpperCase();
    const d = body.destination?.toUpperCase();
    const ac = body.airlineCode?.toUpperCase();
    const agentId = body.agentId;

    const orConditions: any[] = [{ type: 'GLOBAL' }];

    if (o && d && agentId) {
      orConditions.unshift({ type: 'ROUTE_AGENT', origin: o, destination: d, agentId });
    }
    if (ac && agentId) {
      orConditions.unshift({ type: 'AIRLINE_AGENT', airlineCode: ac, agentId });
    }
    if (o && d) {
      orConditions.unshift({ type: 'ROUTE', origin: o, destination: d });
    }
    if (agentId) {
      orConditions.unshift({ type: 'AGENT', agentId });
    }
    if (ac) {
      orConditions.unshift({ type: 'AIRLINE', airlineCode: ac });
    }

    const rules = await this.prisma.markup.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: orConditions,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    if (!rules.length) {
      return {
        markup: 0,
        currency: 'SAR',
        appliedRule: null,
        totalMatched: 0,
        message: 'No matching markup rule found',
      };
    }

    const best = rules[0];
    const baseFare = Number(body.baseFare);
    const totalFare = Number(body.totalFare || body.baseFare);
    const fareBase = best.markupOn === 'TOTAL' ? totalFare : baseFare;
    const fixedPart = Number(best.markupAmount || 0);
    const percentPart = (fareBase * Number(best.markupPercent || 0)) / 100;
    const markupValue = Math.round((fixedPart + percentPart) * 100) / 100;

    return {
      markup: markupValue,
      currency: 'SAR',
      appliedRule: {
        id: best.id,
        type: best.type,
        markupAmount: best.markupAmount,
        markupPercent: best.markupPercent,
        markupOn: best.markupOn,
        priority: best.priority,
      },
      totalMatched: rules.length,
      finalFare: {
        baseFare:
          best.markupOn === 'BASE_FARE'
            ? baseFare + markupValue
            : baseFare,
        totalFare: totalFare + markupValue,
        currency: 'SAR',
      },
    };
  }
}