import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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

    // ── Rate Limiting ──
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,       // 1 second
        limit: 5,        // max 5 requests per second
      },
      {
        name: 'medium',
        ttl: 60000,      // 1 minute
        limit: 50,       // max 50 requests per minute
      },
      {
        name: 'long',
        ttl: 3600000,    // 1 hour
        limit: 500,      // max 500 requests per hour
      },
    ]),

    PrismaModule,
    UploadModule,
    AuthModule,
    AgentModule,
    PaymentModule,
    FlightsModule,
    AdminModule,
  ],

  providers: [
    // ── Global Rate Limit Guard ──
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}