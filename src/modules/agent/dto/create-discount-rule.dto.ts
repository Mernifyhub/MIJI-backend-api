import {
  AgentTier,
  DiscountApplyOn,
  DiscountRuleType,
  DiscountValueType,
  RouteMatchType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDiscountRuleDto {
  @IsEnum(DiscountRuleType)
  type: DiscountRuleType;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DiscountValueType)
  discountType: DiscountValueType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsEnum(DiscountApplyOn)
  discountOn?: DiscountApplyOn;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minFare?: number;

  @IsOptional()
  @IsString()
  airlineCode?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsEnum(RouteMatchType)
  routeMatchType?: RouteMatchType;

  @IsOptional()
  @IsString()
  cabinClass?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsEnum(AgentTier)
  agentTier?: AgentTier;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxUsageTotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxUsagePerAgent?: number;

  @IsOptional()
  @Type(() => Number)
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
  createdById?: string;
}