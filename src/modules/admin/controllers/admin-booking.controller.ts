// src/modules/admin/controllers/admin-booking.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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

@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MANAGER')
export class AdminBookingController {
  constructor(private readonly bookingService: AdminBookingService) {}

  // ✅ GET /admin/bookings
  @Get()
  async getAllBookings() {
    return this.bookingService.getAllBookings();
  }

  // ✅ GET /admin/bookings/:id — সবার শেষে
  @Get(':id')
  async getBookingById(@Param('id') id: string) {
    return this.bookingService.getBookingById(id);
  }
}