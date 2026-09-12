import { appSchema, tableSchema } from '@nozbe/watermelondb';

// Column names are snake_case to match WatermelonDB convention and to keep
// a 1:1 mental map with the PocketBase collection fields (see README).
// `pb_id` / `pb_updated_at` on every table track the linked PocketBase record
// and its last known server-side `updated` timestamp, used for sync + conflict checks.

export default appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'pilots',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'licenses_json', type: 'string' },
        { name: 'medical_expiry', type: 'number', isOptional: true },
        { name: 'regulatory_profile_id', type: 'string', isOptional: true },
        { name: 'pb_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'pb_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'aircraft',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'tail_number', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'category_class', type: 'string' },
        { name: 'complex', type: 'boolean' },
        { name: 'high_performance', type: 'boolean' },
        { name: 'tailwheel', type: 'boolean' },
        { name: 'pb_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'pb_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'flights',
      columns: [
        { name: 'pilot_id', type: 'string', isIndexed: true },
        { name: 'aircraft_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'number' },
        { name: 'route_from', type: 'string' },
        { name: 'route_to', type: 'string' },
        { name: 'total_time', type: 'number' },
        { name: 'pic_time', type: 'number' },
        { name: 'sic_time', type: 'number' },
        { name: 'dual_time', type: 'number' },
        { name: 'solo_time', type: 'number' },
        { name: 'night_time', type: 'number' },
        { name: 'actual_instrument', type: 'number' },
        { name: 'sim_instrument', type: 'number' },
        { name: 'day_landings', type: 'number' },
        { name: 'night_landings', type: 'number' },
        { name: 'remarks', type: 'string', isOptional: true },
        { name: 'instructor_id', type: 'string', isOptional: true },
        { name: 'endorsement_id', type: 'string', isOptional: true },
        { name: 'pb_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'pb_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'endorsements',
      columns: [
        { name: 'flight_id', type: 'string', isIndexed: true },
        { name: 'instructor_id', type: 'string' },
        { name: 'text', type: 'string' },
        { name: 'signature_uri', type: 'string', isOptional: true },
        { name: 'date', type: 'number' },
        { name: 'pb_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'pb_updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'regulatory_profiles',
      columns: [
        { name: 'name', type: 'string' },
        // Structured currency/time-category rules, e.g. FAA 61.57 vs EASA FCL.060.
        // Kept as opaque JSON so new authorities don't require schema migrations.
        { name: 'rules_json', type: 'string' },
        { name: 'pb_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'pb_updated_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
