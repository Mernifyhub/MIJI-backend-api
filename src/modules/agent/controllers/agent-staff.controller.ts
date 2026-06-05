import {Controller,Get,Post,Put,Delete,Body,Param,UseGuards,} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import { CreateStaffDto } from '../dto/create-staff.dto';
import { UpdateStaffDto } from '../dto/update-staff.dto';
import { AgentStaffService } from '../services/agent-staff.service';

@Controller('staff')
@UseGuards(JwtAuthGuard)
export class AgentStaffController {
  constructor(private readonly staffService: AgentStaffService) {}

  // ── GET /api/v1/staff ──
  @Get()
  async getAll(@GetUser('id') agentId: string) {
    return this.staffService.getAll(agentId);
  }

  // ── POST /api/v1/staff ──
  @Post()
  async create(
    @GetUser('id') agentId: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.staffService.create(agentId, dto);
  }

  // ── PUT /api/v1/staff/:id ──
  @Put(':id')
  async update(
    @GetUser('id') agentId: string,
    @Param('id') staffId: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(agentId, staffId, dto);
  }

  // ── DELETE /api/v1/staff/:id ──
  @Delete(':id')
  async delete(
    @GetUser('id') agentId: string,
    @Param('id') staffId: string,
  ) {
    return this.staffService.delete(agentId, staffId);
  }
}