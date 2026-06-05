import {
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class ResolveDiscountDto {
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
  @IsString()
  cabinClass?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  agentTier?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsNumber()
  fareAmount: number;

  @IsNumber()
  baseFare: number;

  @IsOptional()
  @IsString()
  currency?: string;
}