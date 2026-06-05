import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guard/roles.guard';
import { Roles } from 'src/modules/auth/decorator/roles.decorator';
import { AdminRequestService } from '../services/admin-request.service';

@Controller('admin/requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
export class AdminRequestController {
  constructor(private readonly requestService: AdminRequestService) {}

  // ──────────────────────────────────────
  // GET /api/v1/admin/requests
  // ──────────────────────────────────────
  @Get()
  async getAllRequests(@Query('type') type?: string) {
    return this.requestService.getAllRequests({
      type: type || undefined,
    });
  }

  // ──────────────────────────────────────
  // GET /api/v1/admin/requests/:id
  // ──────────────────────────────────────
  @Get(':id')
  async getRequestById(@Param('id') id: string) {
    return this.requestService.getRequestById(id);
  }

  // ──────────────────────────────────────
  // POST /api/v1/admin/requests/:id/assign
  // ──────────────────────────────────────
  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assignRequest(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.requestService.assignRequest(id, req.user.id);
  }

  // ──────────────────────────────────────
  // DELETE /api/v1/admin/requests/:id/release
  // ──────────────────────────────────────
  @Delete(':id/release')
  @HttpCode(HttpStatus.OK)
  async releaseRequest(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.requestService.releaseRequest(id, req.user.id);
  }

  // ──────────────────────────────────────
  // POST /api/v1/admin/requests/:id/process
  // ──────────────────────────────────────
  @Post(':id/process')
  @HttpCode(HttpStatus.OK)
  async processRequest(
    @Param('id') id: string,
    @Req() req: any,
    @Body()
    body: {
      action: string;
      adminNote?: string;
      gdsPnr?: string;
      ticketNumber?: string;
      supplierName?: string;
      issueAmount?: number;
    },
  ) {
    return this.requestService.processRequest(
      id,
      req.user.id,
      body,
    );
  }
}