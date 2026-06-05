import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { GetUser } from 'src/modules/auth/decorator/get-user.decorator';
import { AgentSalesService, SalesResponse } from '../services/agent-sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class AgentSalesController {
  constructor(private readonly salesService: AgentSalesService) {}

 @Get()
async getSales(
  @GetUser('id') agentId: string,
  @Query() query: any,
): Promise<SalesResponse> {
  console.log('=== Sales Controller Called ===');
  console.log('agentId:', agentId);
  console.log('query:', query);

  try {
    const result = await this.salesService.getSales(agentId, query);
    console.log('=== Sales Success ===');
    return result;
  } catch (error: any) {
    console.error('=== Sales Controller Error ===');
    console.error('Message:', error?.message);
    console.error('Code:', error?.code);
    console.error('Meta:', JSON.stringify(error?.meta));
    throw error;
  }
}
}