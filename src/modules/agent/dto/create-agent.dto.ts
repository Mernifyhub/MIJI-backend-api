import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { AgentStatus, Role } from '@prisma/client';

export class CreateAgentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  agentName: string;

  @IsOptional()
  @IsString()
  agentAddress?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  aviationNumber?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role = Role.USER;

  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus = AgentStatus.PENDING;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commission?: number;
}