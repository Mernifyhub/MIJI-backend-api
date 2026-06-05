import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const CREDIT_TYPES = [
  'refund',
  'acm',
  'amount_add',
  'bonus',
  'add_credit',
  'adjustment',
] as const;

export const DEBIT_TYPES = [
  'adm',
  'manual_booking',
  'amount_deduct',
  'date_change',
  'penalty',
] as const;

export const LIMIT_TYPES = ['add_credit', 'limit_add'] as const;

export const ALL_TYPES = [
  ...CREDIT_TYPES,
  ...DEBIT_TYPES,
  'limit_add',
] as const;

export type OperationType = (typeof ALL_TYPES)[number];

export class CreateOperationDto {
  @IsString()
  @IsNotEmpty({ message: 'Agent ID is required' })
  agentId: string;

  @IsString()
  @IsNotEmpty({ message: 'Operation type is required' })
  @IsIn([...ALL_TYPES], {
    message: `Invalid operation type. Must be one of: ${ALL_TYPES.join(', ')}`,
  })
  operationType: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0, { message: 'Amount cannot be negative' })
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  pnr?: string;

  @IsOptional()
  @IsString()
  passengerName?: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsOptional()
  @IsString()
  travelDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  previousLimit?: number;
}