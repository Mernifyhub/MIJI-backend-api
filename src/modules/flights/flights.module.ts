import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';

import { FlightSearchController } from './controllers/flight-search.controller';
import { FlightSearchService } from './services/flight-search.service';

import { DuffelService } from './services/providers/duffel.service';
import { AmadeusService } from './services/providers/amadeus.service';

import { NormalizerService } from './services/processors/normalizer.service';
import { MarkupService } from './services/processors/markup.service';
import { DiscountService } from './services/processors/discount.service';
import { FareService } from './services/processors/fare.service';
import { CurrencyService } from './services/processors/currency.service';
import { TravelpayoutsService } from './services/providers/travelpayouts.service';
import { LocationController } from './controllers/location.controller';
import { LocationService } from './services/location.service';

@Module({
  imports: [PrismaModule],
  controllers: [
     FlightSearchController,
     LocationController, 
  ],
  providers: [
    FlightSearchService,
    LocationService, 
    // Providers
    DuffelService,
    AmadeusService,
    TravelpayoutsService,
    // Processors
    NormalizerService,
    MarkupService,
    DiscountService,
    FareService,
    CurrencyService,
  ],
  exports: [FlightSearchService],
})
export class FlightsModule {}