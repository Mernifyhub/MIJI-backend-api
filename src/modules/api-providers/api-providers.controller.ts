import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiProvidersService } from './api-providers.service';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AdminRoleGuard } from 'src/modules/admin/guards/admin-role.guard';

class ToggleDto {
  isActive: boolean;
}

@Controller('admin/api-providers')
@UseGuards(JwtAuthGuard, AdminRoleGuard) // ✅ same guard pattern তোমার existing system এর মতো
export class ApiProvidersController {
  constructor(private readonly service: ApiProvidersService) {}

  // GET /api/v1/admin/api-providers
  // সব provider এর list + status
  @Get()
  async findAll() {
    const providers = await this.service.findAll();
    return {
      success: true,
      data: providers,
    };
  }

  // PATCH /api/v1/admin/api-providers/:slug/toggle
  // isActive: true/false
  @Patch(':slug/toggle')
  async toggle(
    @Param('slug') slug: string,
    @Body() body: ToggleDto,
  ) {
    const updated = await this.service.toggle(slug, body.isActive);
    return {
      success: true,
      message: `Provider "${slug}" is now ${body.isActive ? 'active' : 'inactive'}`,
      data: updated,
    };
  }
}