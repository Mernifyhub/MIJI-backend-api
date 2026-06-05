// src/modules/admin/dto/create-discount-rule.dto.ts
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDiscountRuleDto {
  @IsString()
  type: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsString()
  discountType: string;

  @IsNumber()
  discountValue: number;

  @IsOptional()
  @IsString()
  discountOn?: string;

  @IsOptional()
  @IsNumber()
  maxDiscount?: number | null;

  @IsOptional()
  @IsNumber()
  minFare?: number | null;

  @IsOptional()
  @IsString()
  airlineCode?: string | null;

  @IsOptional()
  @IsString()
  airlineName?: string | null;

  @IsOptional()
  @IsString()
  origin?: string | null;

  @IsOptional()
  @IsString()
  destination?: string | null;

  @IsOptional()
  @IsString()
  routeMatchType?: string;

  @IsOptional()
  @IsString()
  cabinClass?: string | null;

  @IsOptional()
  @IsString()
  agentId?: string | null;

  @IsOptional()
  @IsString()
  agentTier?: string | null;

  @IsOptional()
  @IsString()
  promoCode?: string | null;

  @IsOptional()
  @IsString()
  validFrom?: string | null;

  @IsOptional()
  @IsString()
  validTo?: string | null;

  @IsOptional()
  @IsNumber()
  maxUsageTotal?: number | null;

  @IsOptional()
  @IsNumber()
  maxUsagePerAgent?: number | null;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isStackable?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  createdById?: string | null;

  @IsOptional()
  @IsString()
  updatedById?: string | null;
}