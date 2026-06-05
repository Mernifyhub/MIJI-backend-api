import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import {
  AgentReportService,
  AllReportResponse,  // ✅ exported interface import করেছি
  DateRangeQuery,
} from '../services/agent-report.service';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentReportController {
  constructor(private readonly reportService: AgentReportService) {}

  // GET /api/v1/agent/all-report
  @Get('all-report')
  async getAllReport(
    @GetUser('id') agentId: string,
    @Query() query: DateRangeQuery,
  ): Promise<AllReportResponse> {  // ✅ explicit return type দিয়েছি
    return this.reportService.getAllReport(agentId, query);
  }
}