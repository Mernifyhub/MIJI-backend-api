import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    // ✅ id/sub 
    const userId = payload.id || payload.sub;

    return {
      id: userId,
      email: payload.email || '',
      role: payload.role || 'USER',
      type: payload.type || 'agent',
      agentId: payload.agentId || userId,
      permissions: payload.permissions || [],
    };
  }
}