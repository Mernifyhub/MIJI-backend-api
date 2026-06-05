// src/common/interceptors/timeout.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly timeoutMs: number;

  constructor(timeoutMs?: number) {
    this.timeoutMs = timeoutMs || 15000;
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    // ✅ Flight search এ timeout skip করো
    const request = context.switchToHttp().getRequest();
    const url: string = request?.url || '';

    // Flight search route এ timeout বেশি দাও
    const isFlightSearch = url.includes('/flights/search');
    const effectiveTimeout = isFlightSearch
      ? 60000  // 60 seconds for flight search
      : this.timeoutMs;

    return next.handle().pipe(
      timeout(effectiveTimeout),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new RequestTimeoutException(
                `Request timed out after ${effectiveTimeout}ms`,
              ),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}