import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ApiProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── সব provider list ──
  async findAll() {
    return this.prisma.apiProviderSetting.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  // ── একটা provider এর status toggle ──
  async toggle(slug: string, isActive: boolean) {
    const provider = await this.prisma.apiProviderSetting.findUnique({
      where: { slug },
    });

    if (!provider) {
      throw new NotFoundException(`Provider "${slug}" not found`);
    }

    return this.prisma.apiProviderSetting.update({
      where: { slug },
      data: { isActive },
    });
  }

  // ── একটা provider active কিনা check ──
  async isActive(slug: string): Promise<boolean> {
    const provider = await this.prisma.apiProviderSetting.findUnique({
      where: { slug },
      select: { isActive: true },
    });

    // না পেলে default active ধরবো
    // যেন misconfiguration এ সব বন্ধ না হয়
    return provider?.isActive ?? true;
  }

  // ── সব active providers এর slug list ──
  async getActiveProviderSlugs(): Promise<string[]> {
    const providers = await this.prisma.apiProviderSetting.findMany({
      where: { isActive: true },
      select: { slug: true },
    });
    return providers.map((p) => p.slug);
  }
}