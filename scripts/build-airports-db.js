// One-off / periodic data build: downloads OurAirports' public-domain airport
// dataset and turns it into the two bundled assets the app ships with:
//   - assets/data/airports.db   (SQLite, used by src/lib/airports/index.native.ts)
//   - assets/data/airports.json (trimmed array, used by src/lib/airports/index.web.ts)
//
// Re-run this (`npm run build:airports`) occasionally to refresh the data —
// airport data changes rarely enough that a live sync isn't worth it.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SOURCE_URL =
  'https://davidmegginson.github.io/ourairports-data/airports.csv';
const OUT_DIR = path.join(process.cwd(), 'assets', 'data');
const DB_PATH = path.join(OUT_DIR, 'airports.db');
const JSON_PATH = path.join(OUT_DIR, 'airports.json');

// Airport types worth keeping for a pilot logbook — drops closed fields and
// non-flyable entries (balloonports still fly, so they stay).
const KEEP_TYPES = new Set([
  'large_airport',
  'medium_airport',
  'small_airport',
  'heliport',
  'seaplane_base',
  'balloonport',
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip, \n handles the line break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch airports.csv: ${res.status} ${res.statusText}`,
    );
  }
  const csvText = await res.text();

  const rows = parseCsv(csvText);
  const header = rows[0];
  const col = Object.fromEntries(header.map((name, i) => [name, i]));

  const airports = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < header.length) continue;
    const type = r[col.type];
    const ident = r[col.ident];
    if (!ident || !KEEP_TYPES.has(type)) continue;

    const icao = r[col.icao_code] || (ident.length === 4 ? ident : '');
    airports.push({
      ident,
      icao: icao || null,
      iata: r[col.iata_code] || null,
      type,
      name: r[col.name],
      municipality: r[col.municipality] || null,
      country: r[col.iso_country] || null,
      region: r[col.iso_region] || null,
      lat: r[col.latitude_deg] ? Number(r[col.latitude_deg]) : null,
      lon: r[col.longitude_deg] ? Number(r[col.longitude_deg]) : null,
      elevationFt: r[col.elevation_ft] ? Number(r[col.elevation_ft]) : null,
    });
  }

  console.log(
    `Parsed ${airports.length} airports (from ${rows.length - 1} rows)`,
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // --- SQLite build (native) ---
  fs.rmSync(DB_PATH, { force: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = OFF');
  db.exec(`
    CREATE TABLE airports (
      ident TEXT PRIMARY KEY,
      icao TEXT,
      iata TEXT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      municipality TEXT,
      country TEXT,
      region TEXT,
      lat REAL,
      lon REAL,
      elevation_ft INTEGER
    );
    CREATE INDEX idx_airports_icao ON airports(icao COLLATE NOCASE);
    CREATE INDEX idx_airports_iata ON airports(iata COLLATE NOCASE);
    CREATE INDEX idx_airports_name ON airports(name COLLATE NOCASE);
    CREATE INDEX idx_airports_municipality ON airports(municipality COLLATE NOCASE);
  `);
  const insert = db.prepare(`
    INSERT INTO airports (ident, icao, iata, type, name, municipality, country, region, lat, lon, elevation_ft)
    VALUES (@ident, @icao, @iata, @type, @name, @municipality, @country, @region, @lat, @lon, @elevationFt)
  `);
  const insertMany = db.transaction((rows) => {
    for (const a of rows) insert.run(a);
  });
  insertMany(airports);
  db.close();
  console.log(`Wrote ${DB_PATH}`);

  // --- JSON build (web) ---
  fs.writeFileSync(JSON_PATH, JSON.stringify(airports));
  console.log(`Wrote ${JSON_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
