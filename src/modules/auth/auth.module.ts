import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategy/jwt.strategy';

import { PrismaModule } from 'src/prisma/prisma.module';
import { UploadModule } from 'src/upload/upload.module';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';

@Module({
  imports: [
    PrismaModule,
    UploadModule,
    MailModule,
    OtpModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'JWT_ACCESS_EXPIRATION',
          ) as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}