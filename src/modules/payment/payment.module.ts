import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from 'src/prisma/prisma.module';

import { PaymentBalanceController } from './controllers/payment-balance.controller';
import { DepositController } from './controllers/deposit.controller';
import { LedgerController } from './controllers/ledger.controller';

import { PaymentBalanceService } from './services/payment-balance.service';
import { DepositService } from './services/deposit.service';
import { LedgerService } from './services/ledger.service';
import { AdminNotificationService } from '../admin/services/admin-notification.service';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      dest: './uploads/receipts',
    }),
  ],
  controllers: [
    PaymentBalanceController,
    DepositController,
    LedgerController,
  ],
  providers: [
    PaymentBalanceService,
    DepositService,
    LedgerService,
    AdminNotificationService,
  ],
  exports: [
    PaymentBalanceService,
    DepositService,
    LedgerService,
  ],
})
export class PaymentModule {}