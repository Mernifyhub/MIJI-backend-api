import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CurrentUserType } from 'src/common/types/current-user.type';
import { AgentDashboardService } from '../services/agent-dashboard.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class AgentDashboardController {
  constructor(
    private readonly agentDashboardService: AgentDashboardService,
  ) {}

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: CurrentUserType) {
    return this.agentDashboardService.getDashboard(
      user.actualUserId,
    );
  }
}