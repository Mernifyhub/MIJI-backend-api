import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProvidersService } from './api-providers.service';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AdminRoleGuard } from 'src/modules/admin/guards/admin-role.guard';

// ✅ Proper DTO with class-validator decorators
class ToggleApiProviderDto {
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}

@Controller('admin/api-providers')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class ApiProvidersController {
  constructor(private readonly service: ApiProvidersService) {}

  // GET /api/v1/admin/api-providers
  @Get()
  async findAll() {
    const providers = await this.service.findAll();
    return {
      success: true,
      data: providers,
    };
  }

  // PATCH /api/v1/admin/api-providers/:slug/toggle
  @Patch(':slug/toggle')
  async toggle(
    @Param('slug') slug: string,
    @Body() body: ToggleApiProviderDto, // ✅ proper DTO
  ) {
    const updated = await this.service.toggle(slug, body.isActive);
    return {
      success: true,
      message: `Provider "${slug}" is now ${body.isActive ? 'active' : 'inactive'}`,
      data: updated,
    };
  }
}