// src/modules/flights/services/location.service.ts

import { Injectable } from '@nestjs/common';
import airports from '../data/airports.json';


type AirportResult = {
  id: string | number;
  name: string;
  iataCode: string;
  address: {
    cityName: string;
    countryName: string;
  };
};

@Injectable()
export class LocationService {
  search(keyword: string): AirportResult[] {
    if (!keyword || keyword.trim().length < 2) {
      return [];
    }
    const cookieParser = require('cookie-parser');
    const term = keyword.toUpperCase().trim();

    const filtered = (airports as any[])
      .filter((airport: any) => {
        const iata = (airport.iata || '').toUpperCase();
        const city = (airport.city || '').toUpperCase();
        const name = (airport.name || '').toUpperCase();

        return (
          iata.includes(term) ||
          city.includes(term) ||
          name.includes(term)
        );
      })
      .slice(0, 10);

    return filtered.map((loc: any, index: number) => ({
      id: loc.iata || index,
      name: loc.name || 'Unknown Airport',
      iataCode: loc.iata || 'N/A',
      address: {
        cityName: loc.city || 'Unknown City',
        countryName: loc.country || 'Unknown Country',
      },
    }));
  }
}