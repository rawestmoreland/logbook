import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import schema from './schema';
import migrations from './migrations';
import Pilot from './models/Pilot';
import Aircraft from './models/Aircraft';
import Flight from './models/Flight';
import Endorsement from './models/Endorsement';
import RegulatoryProfile from './models/RegulatoryProfile';

// LokiJSAdapter is WatermelonDB's browser-compatible adapter (IndexedDB
// under the hood) — SQLiteAdapter relies on native JSI bindings and does
// not run on web. See https://watermelondb.dev/docs/Setup#web.
const adapter = new LokiJSAdapter({
  schema,
  migrations,
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onQuotaExceededError: (error) => {
    console.error('WatermelonDB storage quota exceeded', error);
  },
  onSetUpError: (error) => {
    console.error('WatermelonDB failed to set up', error);
  },
  extraIncrementalIDBOptions: {
    onversionchange: () => {
      // Another tab deleted/upgraded the local database — reload so this
      // tab doesn't keep operating against a stale connection.
      window.location.reload();
    },
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Pilot, Aircraft, Flight, Endorsement, RegulatoryProfile],
});
