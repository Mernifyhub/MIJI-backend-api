// src/modules/admin/controllers/admin-notification.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guard/roles.guard';
import { Roles } from 'src/modules/auth/decorator/roles.decorator';
import { AdminNotificationService } from '../services/admin-notification.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
export class AdminNotificationController {
  constructor(
    private readonly notificationService: AdminNotificationService,
  ) {}

  // GET /admin/notifications
  @Get()
  async getAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('read') read?: string,
    @Query('search') search?: string,
  ) {
    return this.notificationService.getAll(
      req.user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { type, read, search },
    );
  }

  // GET /admin/notifications/unread-count
  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    return this.notificationService.getUnreadCount(req.user.id);
  }

  // GET /admin/notifications/recent
  @Get('recent')
  async getRecent(@Req() req: any) {
    return this.notificationService.getRecent(req.user.id);
  }

  // PATCH /admin/notifications/:id/read
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationService.markAsRead(id, req.user.id);
  }

  // PATCH /admin/notifications/read-all
  @Patch('read-all')
  async markAllAsRead(@Req() req: any) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  // DELETE /admin/notifications/:id
  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.notificationService.delete(id, req.user.id);
  }

  // DELETE /admin/notifications/clear-all
  @Delete('clear-all')
  async clearAll(@Req() req: any) {
    return this.notificationService.clearAll(req.user.id);
  }
}