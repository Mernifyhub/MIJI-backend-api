// src/modules/agent/dto/update-profile.dto.ts
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  agentName?: string;

  @IsOptional()
  @IsString()
  agentAddress?: string;

  @IsOptional()
  @IsString()
  aviationNumber?: string;
}