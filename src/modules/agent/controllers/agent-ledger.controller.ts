// src/payment/controllers/agent-ledger.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AgentLedgerService } from '../services/agent-ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class AgentLedgerController {
  constructor(private readonly agentLedgerService: AgentLedgerService) {}

  // ──────────────────────────────────────
  // GET /api/v1/ledger
  // Full ledger with pagination + filters
  // ──────────────────────────────────────
  @Get()
  async getLedger(
    @Req() req: any,
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
    return this.agentLedgerService.getLedger(req.user.id, {
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

  // ──────────────────────────────────────
  // GET /api/v1/ledger/summary
  // Lightweight summary only
  // ──────────────────────────────────────
  @Get('summary')
  async getLedgerSummary(@Req() req: any) {
    return this.agentLedgerService.getLedgerSummary(req.user.id);
  }

  // ──────────────────────────────────────
  // GET /api/v1/ledger/:id
  // Single entry detail
  // ──────────────────────────────────────
  @Get(':id')
  async getLedgerEntry(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.agentLedgerService.getLedgerEntry(req.user.id, id);
  }
}