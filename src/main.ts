import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Helmet (Security Headers) ──
  app.use(helmet());

  // ── Cookie Parser ──
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    new TimeoutInterceptor(15000),
  );

  // ── Exception Filter ──
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── CORS ──
  const isProduction = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: function (origin, callback) {
      // Production এ no-origin block করবে
      if (!origin) {
        if (isProduction) {
          Logger.warn('🚨 CORS Blocked: No Origin in Production', 'CORS');
          return callback(new Error('CORS blocked: No origin'));
        }
        return callback(null, true);
      }

      const allowedOrigins = [
        'https://mijitravels.com',
        'https://www.mijitravels.com',
        'https://api.mijitravels.com',
        'http://localhost:3000',
        'http://localhost:5173',
      ];

      if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
        callback(null, true);
      } else {
        Logger.warn(`🚨 CORS Blocked for origin: ${origin}`, 'CORS');
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, Cookie, Origin, X-Requested-With',
  });

  // ── Start Server ──
  const port = parseInt(process.env.PORT || '3001', 10);
  await app.listen(port, '0.0.0.0');

  Logger.log(`🚀 Server running on port: ${port}`);
  Logger.log(`📍 API Base: /api/v1`);
  Logger.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch((error) => {
  Logger.error('❌ Failed to start server', error);
  process.exit(1);
});