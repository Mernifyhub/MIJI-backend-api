import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guard/roles.guard';
import { Roles } from 'src/modules/auth/decorator/roles.decorator';
import { AdminLedgerService } from '../services/admin-ledger.service';

@Controller('admin/ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminLedgerController {
  constructor(private readonly adminLedgerService: AdminLedgerService) {}

  // ──────────────────────────────────────────
  // GET /api/v1/admin/ledger/overview
  // All agents overview
  // ──────────────────────────────────────────
  @Get('overview')
  async getOverview(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminLedgerService.getAllAgentsOverview({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search: search || undefined,
    });
  }

  // ──────────────────────────────────────────
  // GET /api/v1/admin/ledger/agent/:agentId
  // Specific agent's ledger
  // ──────────────────────────────────────────
  @Get('agent/:agentId')
  async getAgentLedger(
    @Param('agentId') agentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('sourceType') sourceType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.adminLedgerService.getAgentLedger(agentId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      type: type || undefined,
      sourceType: sourceType || undefined,
      status: status || undefined,
      search: search || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
    });
  }

  // ──────────────────────────────────────────
  // GET /api/v1/admin/ledger/entry/:id
  // Single entry detail
  // ──────────────────────────────────────────
  @Get('entry/:id')
  async getEntry(@Param('id') id: string) {
    return this.adminLedgerService.getEntry(id);
  }

  // ──────────────────────────────────────────
  // POST /api/v1/admin/ledger/manual
  // Add manual ledger entry
  // ──────────────────────────────────────────
  @Post('manual')
  async addManualEntry(
    @Req() req: any,
    @Body()
    body: {
      agentId: string;
      type: string;
      debit?: number;
      credit?: number;
      description: string;
      reference?: string;
      pnr?: string;
      note?: string;
    },
  ) {
    return this.adminLedgerService.addManualEntry(req.user.id, body);
  }
}