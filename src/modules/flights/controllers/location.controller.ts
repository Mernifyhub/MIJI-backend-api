// src/modules/flights/controllers/location.controller.ts

import { Controller, Get, Query } from '@nestjs/common';
import { LocationService } from '../services/location.service';

@Controller('flights/location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get()
  search(@Query('keyword') keyword: string) {
    return this.locationService.search(keyword || '');
  }
}