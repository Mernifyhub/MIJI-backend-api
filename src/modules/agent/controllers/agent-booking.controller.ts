import {Body,Controller,Get,Post,Param,HttpCode,HttpStatus,UseGuards,NotFoundException,BadRequestException,} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guard/jwt-auth.guard';
import { AgentBookingService } from '../services/agent-booking.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CurrentUserType } from 'src/common/types/current-user.type';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class AgentBookingController {
  constructor(
    private readonly bookingService: AgentBookingService,
  ) {}

  // ──────────────────────────────────
  // GET /api/v1/bookings/all
  // ──────────────────────────────────
  @Get('all')
  async getAllBookings(@CurrentUser() user: CurrentUserType) {
    return this.bookingService.getAllBookings(user.actualUserId);
  }

  // ──────────────────────────────────
  // POST /api/v1/bookings/create
  // ──────────────────────────────────
  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  async createBooking(
    @CurrentUser() user: CurrentUserType,
    @Body() body: any,
  ) {
    return this.bookingService.createBooking(
      user.actualUserId,
      body,
    );
  }

  // ──────────────────────────────────
  // POST /api/v1/bookings/requests
  // ✅ /:id এর আগে রাখতে হবে
  // ──────────────────────────────────
  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async submitRequest(
    @CurrentUser() user: CurrentUserType,
    @Body() body: {
      bookingId: string;
      type: string;
      remarks?: string;
    },
  ) {
    return this.bookingService.submitRequest(
      user.actualUserId,
      body,
    );
  }

  // ──────────────────────────────────
  // GET /api/v1/bookings/:id
  // ✅ requests route এর পরে রাখতে হবে
  // ──────────────────────────────────
  @Get(':id')
  async getBookingById(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
  ) {
    return this.bookingService.getBookingById(
      user.actualUserId,
      id,
    );
  }
}