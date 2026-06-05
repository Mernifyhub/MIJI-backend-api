// src/modules/admin/dto/markup/create-markup.dto.ts
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MarkupType {
  GLOBAL = 'GLOBAL',
  AIRLINE = 'AIRLINE',
  ROUTE = 'ROUTE',
  AGENT = 'AGENT',
  AIRLINE_AGENT = 'AIRLINE_AGENT',
  ROUTE_AGENT = 'ROUTE_AGENT',
}

export enum MarkupOn {
  BASE_FARE = 'BASE_FARE',
  TOTAL = 'TOTAL',
}

export enum RouteMatchType {
  EXACT = 'EXACT',
  BIDIRECTIONAL = 'BIDIRECTIONAL',
}

export class CreateMarkupDto {
  @IsEnum(MarkupType)
  type: MarkupType;

  @IsOptional()
  @IsString()
  airlineCode?: string;

  @IsOptional()
  @IsString()
  airlineName?: string;

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
  agentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  markupAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  markupPercent?: number;

  @IsOptional()
  @IsEnum(MarkupOn)
  markupOn?: MarkupOn;

  @IsOptional()
  @IsString()
  markupCurrency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  createdById?: string;
}