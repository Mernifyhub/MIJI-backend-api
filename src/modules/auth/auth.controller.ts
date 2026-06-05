import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  Response as ExpressResponse,
  Request as ExpressRequest,
  CookieOptions,
} from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { GetUser } from './decorator/get-user.decorator';

type AuthCookiePayload = {
  token?: string;
  Role?: string;
  deviceToken?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ========================
  // PRIVATE: type guard
  // ========================
  private hasAuthPayload(result: unknown): result is AuthCookiePayload {
    return !!result && typeof result === 'object';
  }

  // ========================
  // PRIVATE: set auth cookies
  // ========================
  private setAuthCookies(res: ExpressResponse, result: AuthCookiePayload) {
    const isProduction = process.env.NODE_ENV === 'production';

    if (result.token) {
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000, // 1 hour
      });
    }

    if (result.Role) {
      res.cookie('role', result.Role, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
        maxAge: 60 * 60 * 1000,
      });
    }

    // optional: jodi deviceToken cookie-teo rakhte chao
    if (result.deviceToken) {
      res.cookie('deviceToken', result.deviceToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/',
        maxAge: 12 * 60 * 60 * 1000, // 12 hours
      });
    }
  }

  // ========================
  // PRIVATE: clear auth cookies
  // ========================
  private clearAuthCookies(res: ExpressResponse) {
    const isProduction = process.env.NODE_ENV === 'production';

    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    };

    res.clearCookie('token', cookieOptions);
    res.clearCookie('role', cookieOptions);
    res.clearCookie('deviceToken', cookieOptions);
  }

  // ========================
  // STEP 1: LOGIN
  // trusted device hole direct login hote pare
  // nahole OTP send hobe
  // ========================
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.login(loginDto);

    // jodi direct login hoy (trusted device), tahole token thakbe
    if (
      this.hasAuthPayload(result) &&
      ('token' in result || 'Role' in result || 'deviceToken' in result)
    ) {
      this.setAuthCookies(res, result);
    }

    return result;
  }

  // ========================
  // STEP 2: VERIFY OTP
  // OTP verify + token + optional device trust
  // ========================
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || req.socket?.remoteAddress || '';

    const result = await this.authService.verifyLoginOtp(dto, userAgent, ip);

    if (this.hasAuthPayload(result)) {
      this.setAuthCookies(res, result);
    }

    return result;
  }

  // ========================
  // RESEND OTP
  // ========================
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  // ========================
  // LOGOUT
  // ========================
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @GetUser('id') userId: string,
    @Res({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.logout(userId);

    this.clearAuthCookies(res);

    return {
      success: true,
      message: result?.message || 'Logged out successfully',
    };
  }
}