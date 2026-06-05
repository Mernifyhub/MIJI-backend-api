// src/common/interceptors/logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const userAgent = request.headers['user-agent'] || 'Unknown';
    const ip =
      request.ip ||
      request.headers['x-forwarded-for'] ||
      'Unknown';
    const now = Date.now();

    // Request এ user থাকলে userId log করো
    const userId = request.user?.id || 'Anonymous';

    this.logger.log(
      `→ ${method} ${url} | User: ${userId} | IP: ${ip}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - now;
          const statusCode = context
            .switchToHttp()
            .getResponse().statusCode;

          this.logger.log(
            `← ${method} ${url} | ${statusCode} | ${ms}ms`,
          );
        },
        error: (error) => {
          const ms = Date.now() - now;
          const status = error?.status || 500;

          this.logger.error(
            `← ${method} ${url} | ${status} | ${ms}ms | ${error.message}`,
          );
        },
      }),
    );
  }
}