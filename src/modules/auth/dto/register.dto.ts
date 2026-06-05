// src/auth/dto/register.dto.ts

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Match } from '../decorator/match.decorator';

export class RegisterUserDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase and number',
  })
  password: string;

  @IsString()
  @Match('password', { message: 'Passwords do not match' })
  confirmPassword: string;

  @IsString()
  @IsNotEmpty()
  agentName: string;

  @IsString()
  @IsNotEmpty()
  agentAddress: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  aviationNumber: string;

  // ✅ nidCopy, tradeLicense, logo এখানে নেই
  // কারণ এগুলো file - Multer দিয়ে আসবে

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;
}