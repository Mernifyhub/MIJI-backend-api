// src/modules/admin/controllers/admin-import-booking.controller.ts
import {
  Controller,
  Get,
  Post,
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
import { AdminBookingService } from '../services/admin-booking.service';

@Controller('admin/import-booking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
export class AdminImportBookingController {
  constructor(private readonly bookingService: AdminBookingService) {}

  // ✅ GET /admin/import-booking/load-pnr
  @Get('load-pnr')
  async loadPnr(
    @Query('pnr') pnr: string,
    @Query('lastName') lastName: string,
    @Query('agentId') agentId: string,
  ) {
    if (!pnr || !lastName || !agentId) {
      return {
        success: false,
        message: 'PNR, lastName, and agentId are required',
      };
    }

    return this.bookingService.loadPnrFromGDS(
      pnr.trim().toUpperCase(),
      lastName.trim().toUpperCase(),
      agentId.trim(),
    );
  }

  // ✅ POST /admin/import-booking/save
  @Post('save')
  @HttpCode(HttpStatus.CREATED)
  async saveImportedBooking(
    @Req() req: any,
    @Body()
    body: {
      agentId: string;
      pnr: string;
      bookingData: any;
    },
  ) {
    return this.bookingService.saveImportedBooking(req.user.id, body);
  }
}