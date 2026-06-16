import {CanActivate, ExecutionContext, Injectable,Logger,UnauthorizedException,} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

type JwtUser = {
  id: string;
  role?: string;
  type?: string;
  agentId?: string;
};

type RequestWithUser = {
  headers: { authorization?: string };
  cookies?: Record<string, string>;
  user?: JwtUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    // ✅ Cookie CHCEK FIRST THEN Header
    const cookieToken = request.cookies?.token ?? null;
    const authHeader = request.headers?.authorization;
    const bearerToken =
      authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    const token = cookieToken ?? bearerToken;

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // ✅ getOrThrow use for better error handling 
    const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');

    try {
      const decoded = jwt.verify(token, secret) as JwtUser;
      request.user = decoded;
      return true;
    } catch (error: any) {
      this.logger.warn(`JWT verify failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}