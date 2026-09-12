// Read-only reference data from OurAirports (public domain). Not synced,
// not part of WatermelonDB — see scripts/build-airports-db.js.
export type Airport = {
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
  elevationFt: number | null;
};
