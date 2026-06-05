import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';

import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminMarkupController } from './controllers/admin-markup.controller';
import { AdminAgentController } from './controllers/admin-agent.controller';

import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminMarkupService } from './services/admin-markup.service';
import { AdminAgentService } from './services/admin-agent.service';
import { AdminDepositController } from './controllers/admin-deposit.controller';
import { AdminDepositService } from './services/admin-deposit.service';
import { AdminManualOperationController } from './controllers/admin-manual-operation.controller';
import { AdminManualOperationService } from './services/admin-manual-operation.service';
import { AdminDiscountController } from './controllers/admin-discount.controller';
import { AdminDiscountService } from './services/admin-discount.service';
import { DiscountService } from '../flights/services/processors/discount.service';
import { MulterModule } from '@nestjs/platform-express';
import { AdminRequestController } from './controllers/admin-request.controller';
import { AdminRequestService } from './services/admin-request.service';
import { AdminBookingController } from './controllers/admin-booking.controller';
import { AdminBookingService } from './services/admin-booking.service';
import { AgentModule } from '../agent/agent.module';
import { AdminImportBookingController } from './controllers/admin-import-booking.controller';
import { AdminNotificationController } from './controllers/admin-notification.controller';
import { AdminNotificationService } from './services/admin-notification.service';


@Module({
  imports: [PrismaModule, AgentModule,
     MulterModule.register({
      dest: './uploads/receipts',
    }),
    
  ],
  controllers: [
    AdminDashboardController,
    AdminMarkupController,
    AdminAgentController,
    AdminDepositController,
    AdminManualOperationController,
    AdminDiscountController,
    AdminRequestController,
    AdminBookingController,
    AdminImportBookingController,
     AdminNotificationController,
    
  ],
  providers: [
    AdminDashboardService,
    AdminMarkupService,
    AdminAgentService,
    AdminDepositService,
    AdminManualOperationService,
    AdminDiscountService,
    DiscountService,
    AdminRequestService,
    AdminBookingService,
    AdminNotificationService,
     
  ],
  exports: [
    AdminDashboardService,
    AdminMarkupService,
    AdminAgentService,
    AdminDepositService,
    AdminManualOperationService,
    AdminDiscountService,
    AdminBookingService,
    AdminNotificationService,

  ],
})
export class AdminModule {}