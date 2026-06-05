import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

type JwtUser = {
  id: string;
  role?: string;  
  type?: string;
  agentId?: string;
};

type RequestWithUser = {
  headers: {
    authorization?: string;
  };
  cookies?: Record<string, string>;
  user?: JwtUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request =
      context.switchToHttp().getRequest<RequestWithUser>();

    const authHeader = request.headers?.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.replace('Bearer ', '')
        : null;

    const cookieToken = request.cookies?.token;
    const token = cookieToken || bearerToken;

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      this.logger.error('JWT_ACCESS_SECRET is missing');
      throw new UnauthorizedException('JWT secret not configured');
    }

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