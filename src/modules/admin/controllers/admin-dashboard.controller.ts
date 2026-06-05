import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AdminRoleGuard } from '../guards/admin-role.guard';
import { AdminDashboardService } from '../services/admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
  ) {}

  // GET /api/v1/admin/dashboard
  @Get()
  async getDashboard() {
    return this.dashboardService.getDashboard();
  }
}