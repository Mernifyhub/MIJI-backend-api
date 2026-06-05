import {
  IsString,
  IsNotEmpty,
  MinLength,
  Matches,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
} from 'class-validator';

export enum StaffRole {
  USER = 'USER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Only letters, numbers, dots, hyphens allowed',
  })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsEnum(StaffRole, {
    message: 'Invalid role. Must be USER, OPERATOR, or VIEWER',
  })
  role: StaffRole;

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