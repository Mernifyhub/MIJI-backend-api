import { IsString } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  email: string;
}