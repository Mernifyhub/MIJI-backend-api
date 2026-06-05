import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import { LedgerQueryDto } from '../dto/ledger-query.dto';
import { LedgerService } from '../services/ledger.service';
import type { LedgerResponse } from '../services/ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  async getLedger(
    @GetUser('id') userId: string,
    @Query() query: LedgerQueryDto,
  ): Promise<LedgerResponse> {
    return this.ledgerService.getLedger(userId, query);
  }
}