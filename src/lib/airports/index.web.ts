import type { Airport } from './types';

const RESULT_LIMIT = 25;
// Cap how many matches we collect before sorting, so a broad query (e.g. a
// single letter) doesn't force a full-array sort over thousands of hits.
const SCAN_LIMIT = 500;

// Loaded lazily (not at module import time) so the ~15MB dataset is only
// fetched when a search actually happens, not on initial app load.
let dataPromise: Promise<Airport[]> | null = null;

function loadData(): Promise<Airport[]> {
  if (!dataPromise) {
    dataPromise = import('@/assets/data/airports.json').then(
      (mod) => (mod as unknown as { default: Airport[] }).default ?? (mod as unknown as Airport[])
    );
  }
  return dataPromise;
}

function matchScore(airport: Airport, upperQuery: string): number {
  if (
    airport.ident.toUpperCase() === upperQuery ||
    airport.icao?.toUpperCase() === upperQuery ||
    airport.iata?.toUpperCase() === upperQuery
  ) {
    return 0;
  }
  if (
    airport.ident.toUpperCase().startsWith(upperQuery) ||
    airport.icao?.toUpperCase().startsWith(upperQuery) ||
    airport.iata?.toUpperCase().startsWith(upperQuery)
  ) {
    return 1;
  }
  return 2;
}

export async function searchAirports(query: string): Promise<Airport[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const upperQuery = trimmed.toUpperCase();

  const airports = await loadData();
  const matches: Airport[] = [];
  for (const airport of airports) {
    if (
      airport.ident.toUpperCase().includes(upperQuery) ||
      airport.icao?.toUpperCase().includes(upperQuery) ||
      airport.iata?.toUpperCase().includes(upperQuery) ||
      airport.name.toUpperCase().includes(upperQuery) ||
      airport.municipality?.toUpperCase().includes(upperQuery)
    ) {
      matches.push(airport);
      if (matches.length >= SCAN_LIMIT) break;
    }
  }

  matches.sort(
    (a, b) => matchScore(a, upperQuery) - matchScore(b, upperQuery) || a.name.localeCompare(b.name)
  );
  return matches.slice(0, RESULT_LIMIT);
}

export async function getAirportByIdent(ident: string): Promise<Airport | null> {
  const upper = ident.trim().toUpperCase();
  if (!upper) return null;

  const airports = await loadData();
  return airports.find((a) => a.ident.toUpperCase() === upper || a.icao?.toUpperCase() === upper) ?? null;
}
