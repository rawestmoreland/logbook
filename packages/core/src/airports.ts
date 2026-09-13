// Read-only reference data sourced from OurAirports (public domain) and served
// from the `airports` PocketBase collection, seeded by scripts/. Clients query
// it rather than bundling the dataset — it is far too large to ship to a browser.
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
