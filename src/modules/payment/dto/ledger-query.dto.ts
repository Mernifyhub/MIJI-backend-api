import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum LedgerType {
  ALL = 'all',
  DEPOSIT = 'deposit',
  BOOKING = 'booking',
  MANUAL = 'manual',
  REFUND = 'refund',
}

export class LedgerQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(LedgerType)
  type?: LedgerType;

  @IsOptional()
  @IsString()
  search?: string;
}