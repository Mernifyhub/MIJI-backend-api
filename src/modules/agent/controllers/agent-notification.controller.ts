import {
  Controller,
  Get,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
} from "@nestjs/common";
import { AgentNotificationService } from "src/modules/agent/services/agent-notification.service";
import { JwtAuthGuard } from "src/modules/auth/guard/jwt-auth.guard";

@Controller("agent/notifications")
@UseGuards(JwtAuthGuard)
export class AgentNotificationController {
  constructor(
    private readonly notificationService: AgentNotificationService
  ) {}

  // ✅ GET /agent/notifications — All notifications for logged-in agent
  @Get()
  async getAll(
    @Request() req: any,
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ) {
    return this.notificationService.getAll(
      req.user.id,
      parseInt(page),
      parseInt(limit)
    );
  }

  // ✅ GET /agent/notifications/unread-count
  @Get("unread-count")
  async getUnreadCount(@Request() req: any) {
    return this.notificationService.getUnreadCount(req.user.id);
  }

  // ✅ PATCH /agent/notifications/:id/read — Mark single as read
  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param("id") id: string, @Request() req: any) {
    return this.notificationService.markAsRead(id, req.user.id);
  }

  // ✅ PATCH /agent/notifications/mark-all-read — Mark all as read
  @Patch("mark-all-read")
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Request() req: any) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  // ✅ DELETE /agent/notifications/:id — Delete single notification
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async delete(@Param("id") id: string, @Request() req: any) {
    return this.notificationService.delete(id, req.user.id);
  }

  // ✅ DELETE /agent/notifications/clear-all — Delete all
  @Delete("clear-all")
  @HttpCode(HttpStatus.OK)
  async clearAll(@Request() req: any) {
    return this.notificationService.clearAll(req.user.id);
  }
}