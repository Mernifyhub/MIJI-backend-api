import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { AdminAgentService } from '../services/admin-agent.service';

@Controller('admin/agents')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminAgentController {
  constructor(private readonly agentService: AdminAgentService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('tier') tier?: string,
    @Query('country') country?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.agentService.findAll({
      search,
      status,
      tier,
      country,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      sortBy,
      sortOrder,
    });
  }

  @Post()
  async create(@Body() body: any) {
    return this.agentService.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.agentService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.agentService.remove(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.agentService.updateStatus(id, body.status);
  }

  @Patch(':id/pre-booking')
  async updatePreBooking(
    @Param('id') id: string,
    @Body() body: { preBookingEnabled: boolean },
  ) {
    return this.agentService.updatePreBooking(id, body.preBookingEnabled);
  }

  @Post('bulk')
  async bulkAction(
    @Body() body: { ids: string[]; action: string },
  ) {
    return this.agentService.bulkAction(body.ids, body.action);
  }
}