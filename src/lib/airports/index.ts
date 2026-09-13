import * as SQLite from 'expo-sqlite';
import type { Airport } from '@logbook/core';

const DATABASE_NAME = 'airports.db';
const RESULT_LIMIT = 25;

// SQLiteProvider does this same asset-copy-then-open dance internally for
// its `assetSource` prop; we call the underlying helper directly so airport
// search is a plain async function usable outside a component tree.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      await SQLite.importDatabaseFromAssetAsync(DATABASE_NAME, {
        assetId: require('@/assets/data/airports.db'),
      });
      return SQLite.openDatabaseAsync(DATABASE_NAME);
    })();
  }
  return dbPromise;
}

type AirportRow = {
  ident: string;
  icao: string | null;
  iata: string | null;
  type: string;
  name: string;
  municipality: string | null;
  country: string | null;
  region: string | null;
  lat: number | null;
  lon: number | null;
  elevation_ft: number | null;
};

function rowToAirport(row: AirportRow): Airport {
  return {
    ident: row.ident,
    icao: row.icao,
    iata: row.iata,
    type: row.type,
    name: row.name,
    municipality: row.municipality,
    country: row.country,
    region: row.region,
    // The shared Airport type dropped `| null` here to match the PocketBase
    // collection's contract (its number field has no representable null —
    // see packages/core/src/airports.ts). SQLite can still store a genuine
    // NULL in the bundled asset; collapse it to 0 the same way the
    // PocketBase-backed mapper does, so both sources agree.
    lat: row.lat ?? 0,
    lon: row.lon ?? 0,
    elevationFt: row.elevation_ft ?? 0,
  };
}

export async function searchAirports(query: string): Promise<Airport[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = await getDb();
  const prefix = `${trimmed}%`;
  const contains = `%${trimmed}%`;

  const rows = await db.getAllAsync<AirportRow>(
    `SELECT * FROM airports
     WHERE ident LIKE ? OR icao LIKE ? OR iata LIKE ? OR name LIKE ? OR municipality LIKE ?
     ORDER BY
       CASE
         WHEN ident = ? OR icao = ? OR iata = ? THEN 0
         WHEN ident LIKE ? OR icao LIKE ? OR iata LIKE ? THEN 1
         ELSE 2
       END,
       name
     LIMIT ?`,
    [
      prefix,
      prefix,
      prefix,
      contains,
      contains,
      trimmed,
      trimmed,
      trimmed,
      prefix,
      prefix,
      prefix,
      RESULT_LIMIT,
    ]
  );

  return rows.map(rowToAirport);
}

export async function getAirportByIdent(ident: string): Promise<Airport | null> {
  const trimmed = ident.trim();
  if (!trimmed) return null;

  const db = await getDb();
  const row = await db.getFirstAsync<AirportRow>(
    `SELECT * FROM airports WHERE ident = ? COLLATE NOCASE OR icao = ? COLLATE NOCASE LIMIT 1`,
    [trimmed, trimmed]
  );
  return row ? rowToAirport(row) : null;
}
