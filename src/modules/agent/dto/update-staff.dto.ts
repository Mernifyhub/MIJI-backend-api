import {
  IsString,
  IsOptional,
  MinLength,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { StaffRole } from './create-staff.dto';

export class UpdateStaffDto {
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}