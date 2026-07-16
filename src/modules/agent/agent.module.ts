import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from 'src/prisma/prisma.module';

import { AgentDashboardController } from './controllers/agent-dashboard.controller';
import { AgentProfileController } from './controllers/agent-profile.controller';
import { AgentStaffController } from './controllers/agent-staff.controller';

import { AgentDashboardService } from './services/agent-dashboard.service';
import { AgentProfileService } from './services/agent-profile.service';
import { AgentSalesService } from './services/agent-sales.service';
import { AgentBookingController } from './controllers/agent-booking.controller';
import { AgentBookingService } from './services/agent-booking.service';
import { AgentSalesController } from './controllers/agent-sales.controller';
import { AgentStaffService } from './services/agent-staff.service';
import { AgentLedgerController } from './controllers/agent-ledger.controller';
import { AgentLedgerService } from './services/agent-ledger.service';
import { AgentReportController } from './controllers/agent-report.controller';
import { AgentReportService } from './services/agent-report.service';
import { AgentNotificationController } from './controllers/agent-notification.controller';
import { AgentNotificationService } from './services/agent-notification.service';
import { FlightsModule } from 'src/modules/flights/flights.module'; // ✅ ADD
import { AmadeusService } from '../flights/services/providers/amadeus.service';
import { TravelpayoutsService } from '../flights/services/providers/travelpayouts.service';
import { DuffelService } from '../flights/services/providers/duffel.service';

@Module({
  imports: [
    PrismaModule, FlightsModule, // ✅ ADD
    MulterModule.register({ dest: './uploads' }),
  ],
  controllers: [
    AgentDashboardController,
    AgentProfileController,
    AgentBookingController,
    AgentLedgerController,
    AgentStaffController,
    AgentSalesController,
    AgentReportController,
    AgentNotificationController
  ],
  providers: [
    AgentDashboardService,
    AgentProfileService,
    AgentBookingService,
    AgentLedgerService,
    AgentStaffService,
    AgentSalesService,
    AgentReportService,
    AgentNotificationService,
    AmadeusService,
    DuffelService,           // ✅ ADD
    TravelpayoutsService,    // ✅ ADD
  ],
  exports: [
    AgentDashboardService,
    AgentProfileService,
    AgentBookingService,
    AgentLedgerService,
    AgentStaffService,
    AgentSalesService,
    AgentReportService,
    AgentNotificationService
  ],
})
export class AgentModule {}