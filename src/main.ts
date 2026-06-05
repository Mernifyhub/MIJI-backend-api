// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Cookie Parser ──
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());

  // ── Global Prefix ──
  app.setGlobalPrefix('api/v1');

  // ── Validation ──
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ── Interceptors ──
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TimeoutInterceptor(15000), // 15 second timeout
  );

  // ── Exception Filter ──
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── CORS ──
  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  Logger.log(
    `🚀 Application running on http://localhost:${port}/api/v1`,
  );
}

bootstrap().catch((error) => {
  Logger.error('Error starting server', error);
  process.exit(1);
});