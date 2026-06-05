// src/common/interceptors/response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface WrappedResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, WrappedResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<WrappedResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: response.statusCode,
        data,
        timestamp: new Date().toISOString(),
        path: request.url,
      })),
    );
  }
}