import { describe, expect, it } from 'vitest';
import { airportFromRecord } from './airports.js';

describe('airportFromRecord', () => {
  it('collapses PocketBase empty strings to null for text fields', () => {
    const airport = airportFromRecord({
      ident: '00AK',
      icao: '',
      iata: '',
      type: 'small_airport',
      name: 'Lowell Field',
      municipality: '',
      country: 'US',
      region: 'US-AK',
      lat: 59.949,
      lon: -151.696,
      elevation_ft: 450,
    });
    expect(airport.icao).toBeNull();
    expect(airport.iata).toBeNull();
    expect(airport.municipality).toBeNull();
    expect(airport.country).toBe('US');
  });

  it('keeps a real value untouched', () => {
    const airport = airportFromRecord({
      ident: 'KJFK',
      icao: 'KJFK',
      iata: 'JFK',
      type: 'large_airport',
      name: 'John F Kennedy International Airport',
      municipality: 'New York',
      country: 'US',
      region: 'US-NY',
      lat: 40.639447,
      lon: -73.779317,
      elevation_ft: 13,
    });
    expect(airport.icao).toBe('KJFK');
    expect(airport.lat).toBe(40.639447);
    expect(airport.elevationFt).toBe(13);
  });

  it('defaults missing numeric fields to 0, matching the PocketBase contract', () => {
    const airport = airportFromRecord({
      ident: '00CA',
      type: 'heliport',
      name: 'Goodyear Air Base Heliport',
    });
    expect(airport.lat).toBe(0);
    expect(airport.lon).toBe(0);
    expect(airport.elevationFt).toBe(0);
  });
});
