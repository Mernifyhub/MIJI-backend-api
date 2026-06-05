import { IsBoolean, IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @IsBoolean()
  @IsOptional()
  rememberDevice?:boolean;
}