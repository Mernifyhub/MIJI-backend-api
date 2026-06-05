// src/modules/flights/dto/flight-search.dto.ts
import {IsEnum,IsNotEmpty,IsOptional,IsString,IsInt,Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FlightSearchDto {
  
  @IsEnum(['ONE_WAY', 'ROUND_TRIP', 'MULTI_CITY'])
  tripType: 'ONE_WAY' | 'ROUND_TRIP' | 'MULTI_CITY';

  @IsString()
  @IsNotEmpty()
  origin: string;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsString()
  @IsNotEmpty()
  departureDate: string;

  @IsOptional()
  @IsString()
  returnDate?: string;

  @IsOptional()
  @IsString()
  cabinClass?: string;

  // ✅ travelClass add করা হয়েছে (Frontend এ এই name use হচ্ছে)
  @IsOptional()
  @IsString()
  travelClass?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  infants?: number;

  @IsOptional()
  @IsEnum(['all', 'duffel', 'amadeus', 'travelpayouts'])
  provider?: 'all' | 'duffel' | 'amadeus' | 'travelpayouts';

  @IsOptional()
  @IsString()
  segments?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;
}