import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      // ✅ Cookie + Header take token 
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.token ?? null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    // ✅ only sub user — for consistent
    return {
      id: payload.sub ?? payload.id,
      email: payload.email ?? '',
      role: payload.role ?? 'USER',
      type: payload.type ?? 'agent',
      agentId: payload.agentId ?? null,
      permissions: payload.permissions ?? [],
    };
  }
}