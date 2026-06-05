import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  MOBILE_BANKING = 'MOBILE_BANKING',
  CASH = 'CASH',
}

export class CreateDepositDto {
  @Type(() => Number)
  @IsNumber()
  @Min(100, { message: 'Minimum deposit amount is SAR 100' })
  amount: number;

  @IsEnum(PaymentMethod, { message: 'Invalid payment method' })
  @IsNotEmpty()
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}