import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  Response as ExpressResponse,
  Request as ExpressRequest,
  CookieOptions,
} from 'express';

import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { GetUser } from './decorator/get-user.decorator';

// Service থেকে type নিয়ে আয় - redefine করো না
type LoginServiceResult = Awaited<ReturnType<AuthService['login']>>;
type VerifyServiceResult = Awaited<ReturnType<AuthService['verifyLoginOtp']>>;

const COOKIE_NAMES = {
  TOKEN: 'token',
  ROLE: 'role',
  DEVICE_TOKEN: 'deviceToken',
} as const;

const TOKEN_MAX_AGE = 60 * 60 * 1000;
const DEVICE_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  constructor(private readonly authService: AuthService) {}

  private get baseCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: this.isProduction ? 'none' : 'lax',
      path: '/',
    };
  }

  private setAuthCookies(
    res: ExpressResponse,
    result: { token: string; Role: string; deviceToken?: string },
  ): void {
    const base = this.baseCookieOptions;

    res.cookie(COOKIE_NAMES.TOKEN, result.token, {
      ...base,
      maxAge: TOKEN_MAX_AGE,
    });

    res.cookie(COOKIE_NAMES.ROLE, result.Role, {
      ...base,
      httpOnly: false,
      maxAge: TOKEN_MAX_AGE,
    });

    if (result.deviceToken) {
      res.cookie(COOKIE_NAMES.DEVICE_TOKEN, result.deviceToken, {
        ...base,
        maxAge: DEVICE_TOKEN_MAX_AGE,
      });
    }
  }

  private clearAuthCookies(res: ExpressResponse): void {
    const base = this.baseCookieOptions;
    Object.values(COOKIE_NAMES).forEach((name) => {
      res.clearCookie(name, base);
    });
  }

  private getDeviceTokenFromCookie(req: ExpressRequest): string | undefined {
    return req.cookies?.[COOKIE_NAMES.DEVICE_TOKEN];
  }

  // Simple type guard - token আছে কিনা চেক করো
  private hasToken(result: any): result is { token: string; Role: string; deviceToken?: string } {
    return result && typeof result === 'object' && typeof result.token === 'string';
  }

  // ========================
  // REGISTER
  // ========================
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'nidCopy', maxCount: 1 },
      { name: 'tradeLicense', maxCount: 1 },
      { name: 'logo', maxCount: 1 },
    ]),
  )
  async register(
    @Body() registerDto: RegisterUserDto,
    @UploadedFiles()
    files: {
      nidCopy?: Express.Multer.File[];
      tradeLicense?: Express.Multer.File[];
      logo?: Express.Multer.File[];
    },
  ) {
    if (!files?.nidCopy?.[0]) {
      throw new BadRequestException('NID copy is required');
    }

    if (!files?.tradeLicense?.[0]) {
      throw new BadRequestException('Trade license is required');
    }

    const filePaths = {
      nidCopy: files.nidCopy[0].path,
      tradeLicense: files.tradeLicense[0].path,
      logo: files.logo?.[0]?.path,
    };

    return this.authService.register(registerDto, filePaths);
  }

  // ========================
  // LOGIN
  // ========================
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<LoginServiceResult> {
    const deviceToken = this.getDeviceTokenFromCookie(req);
    
    // Fix: Explicitly type করো যাতে undefined accept করে
    const payload: LoginDto & { deviceToken?: string } = {
      ...loginDto,
      ...(deviceToken && { deviceToken }), // শুধু থাকলে যোগ করো
    };

    const result = await this.authService.login(payload);

    if (this.hasToken(result)) {
      this.setAuthCookies(res, result);
    }

    return result;
  }

  // ========================
  // VERIFY OTP
  // ========================
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<VerifyServiceResult> {
    const userAgent = req.headers['user-agent'] ?? '';
    const ip = req.ip ?? req.socket?.remoteAddress ?? '';

    const result = await this.authService.verifyLoginOtp(dto, userAgent, ip);

    if (this.hasToken(result)) {
      this.setAuthCookies(res, result);
    }

    return result;
  }

  // ========================
  // RESEND OTP
  // ========================
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(
    @Body() dto: ResendOtpDto,
  ): Promise<{ success: boolean; message: string }> {
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
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.authService.logout(userId);
    this.clearAuthCookies(res);

    return {
      success: true,
      message: result?.message ?? 'Logged out successfully',
    };
  }
}