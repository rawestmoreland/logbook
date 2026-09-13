// Read-only reference data sourced from OurAirports (public domain) and served
// from the `airports` PocketBase collection, seeded by
// `go run . airports:seed` in pocketbase/base (see
// pocketbase/base/commands/seed_airports.go). Clients query it rather than
// bundling the dataset — it is far too large to ship to a browser or an app
// binary.
export type Airport = {
  ident: string;
  icao: string | null;
  iata: string | null;
  type: string;
  name: string;
  municipality: string | null;
  country: string | null;
  region: string | null;
  // PocketBase's number field has no representable null (its documented
  // zero value is 0), so these are never null once round-tripped through
  // the collection — a missing source value seeds as 0, indistinguishable
  // from a genuine 0 (e.g. true sea-level elevation). Kept as plain
  // `number` rather than `number | null` to match that contract honestly.
  lat: number;
  lon: number;
  elevationFt: number;
};

/**
 * The subset of an `airports` PocketBase record this module reads — the
 * snake_case shape the collection actually stores (see
 * `AirportsRecord`/`AirportsResponse` in pocketbase-types.ts). Kept
 * independent of those generated types so this mapper compiles against any
 * object shaped like a record, including a partial one from a `fields=`
 * projection.
 */
export type AirportRecordLike = {
  ident: string;
  icao?: string;
  iata?: string;
  type: string;
  name: string;
  municipality?: string;
  country?: string;
  region?: string;
  lat?: number;
  lon?: number;
  elevation_ft?: number;
};

/**
 * Maps a raw `airports` PocketBase record to the client-facing `Airport`
 * shape, collapsing PocketBase's empty-string zero value to `null` for text
 * fields — the same normalization the pre-PocketBase bundled-asset build
 * applied (`r[col.icao_code] || null`), preserved here so callers don't see
 * a behavior change.
 */
export function airportFromRecord(record: AirportRecordLike): Airport {
  return {
    ident: record.ident,
    icao: record.icao || null,
    iata: record.iata || null,
    type: record.type,
    name: record.name,
    municipality: record.municipality || null,
    country: record.country || null,
    region: record.region || null,
    lat: record.lat ?? 0,
    lon: record.lon ?? 0,
    elevationFt: record.elevation_ft ?? 0,
  };
}
