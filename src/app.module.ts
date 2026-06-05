import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { AgentModule } from './modules/agent/agent.module';
import { PaymentModule } from './modules/payment/payment.module';
import { FlightsModule } from './modules/flights/flights.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    UploadModule,
    AuthModule,
    AgentModule,
    PaymentModule,
    FlightsModule,
    AdminModule

  ],
})
export class AppModule {}