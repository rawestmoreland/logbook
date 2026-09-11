import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import Pilot from './models/Pilot';
import Aircraft from './models/Aircraft';
import Flight from './models/Flight';
import Endorsement from './models/Endorsement';
import RegulatoryProfile from './models/RegulatoryProfile';

// NOTE: WatermelonDB's SQLite adapter relies on native bindings and does NOT
// run inside Expo Go. You need a custom dev client (`expo prebuild` +
// `expo run:ios` / `expo run:android`) or the bare workflow. See README.
const adapter = new SQLiteAdapter({
  schema,
  jsi: true,
  onSetUpError: (error) => {
    console.error('WatermelonDB failed to set up', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Pilot, Aircraft, Flight, Endorsement, RegulatoryProfile],
});
