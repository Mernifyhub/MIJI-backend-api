import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    // ── HTTP Exception (Known errors) ──
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as any;
        message = resp.message || message;
        error = resp.error || error;
      }
    }
    // ── Unknown Error (Internal) ──
    else if (exception instanceof Error) {
      // ✅ Production এ raw error leak করবো না
      if (this.isProduction) {
        message = 'Something went wrong. Please try again later.';
        error = 'Internal Server Error';
      } else {
        // Development এ পুরো error দেখাবে debug এর জন্য
        message = exception.message;
        error = exception.name;
      }
    }

    // ── Log Error (Internal logging always full info) ──
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} | ${status} | ${
          exception instanceof Error ? exception.message : message
        }`,
        exception instanceof Error ? exception.stack : '',
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} | ${status} | ${
          Array.isArray(message) ? message.join(', ') : message
        }`,
      );
    }

    // ── Sanitize 404 Errors (path leak protection) ──
    if (status === 404 && this.isProduction) {
      message = 'Resource not found';
    }

    // ── Response (Production safe) ──
    const responseBody: any = {
      success: false,
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
    };

    // ✅ Production এ path leak করবো না
    if (!this.isProduction) {
      responseBody.path = request.url;
    }

    response.status(status).json(responseBody);
  }
}