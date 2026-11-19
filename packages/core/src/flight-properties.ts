import { z } from 'zod';

import { DECIMAL_PATTERN, INTEGER_PATTERN } from './field-patterns.js';

/**
 * Custom flight properties (MyFlightbook parity, v1).
 *
 * MyFlightbook's `CustomPropertyType` is an admin-managed catalog of ~150
 * typed properties; this is the deliberately small, fixed subset — a
 * hardcoded list, no per-user favorites/MRU, no autocomplete. Entries are
 * append-only: `id` is the stable slug persisted in `flights.properties`,
 * so it must never be renamed or reused.
 */
export type FlightPropertyValueType = 'string' | 'decimal' | 'integer';

export type FlightPropertyType = {
  /** Stable slug stored on the flight — never change once shipped. */
  id: string;
  /** Display name; also the CSV export column header. */
  title: string;
  type: FlightPropertyValueType;
  /** One line, shown as a hint in the property picker. */
  description: string;
};

export const FLIGHT_PROPERTY_TYPES: ReadonlyArray<FlightPropertyType> = [
  {
    id: 'flight_number',
    title: 'Flight Number',
    type: 'string',
    description: 'Airline or operator flight number',
  },
  {
    id: 'pic_name',
    title: 'PIC Name',
    type: 'string',
    description: 'Pilot in command, when you were not PIC (SIC or dual received)',
  },
  {
    id: 'safety_pilot_name',
    title: 'Safety Pilot Name',
    type: 'string',
    description: 'Safety pilot for simulated instrument flight',
  },
  {
    id: 'safety_pilot_time',
    title: 'Safety Pilot Time',
    type: 'decimal',
    description: 'Hours flown as safety pilot',
  },
  {
    id: 'ground_instruction_given',
    title: 'Ground Instruction Given',
    type: 'decimal',
    description: 'Hours of ground instruction you gave (separate from dual given in flight)',
  },
  {
    id: 'ground_instruction_received',
    title: 'Ground Instruction Received',
    type: 'decimal',
    description: 'Hours of ground instruction you received',
  },
  {
    id: 'passenger_count',
    title: 'Passenger Count',
    type: 'integer',
    description: 'Number of passengers carried',
  },
  {
    id: 'fuel_added',
    title: 'Fuel Added',
    type: 'decimal',
    description: 'Fuel added, in gallons',
  },
  {
    id: 'tach_start',
    title: 'Tach Start',
    type: 'decimal',
    description: 'Tachometer reading at start',
  },
  {
    id: 'tach_end',
    title: 'Tach End',
    type: 'decimal',
    description: 'Tachometer reading at end',
  },
  {
    id: 'multi_pilot_time',
    title: 'Multi-Pilot Time',
    type: 'decimal',
    description: 'Hours flown in a multi-pilot crew',
  },
  {
    id: 'nvg_time',
    title: 'NVG Time',
    type: 'decimal',
    description: 'Hours flown using night vision goggles',
  },
];

const PROPERTY_TYPES_BY_ID: ReadonlyMap<string, FlightPropertyType> = new Map(
  FLIGHT_PROPERTY_TYPES.map((t) => [t.id, t]),
);

export function getFlightPropertyType(id: string): FlightPropertyType | undefined {
  return PROPERTY_TYPES_BY_ID.get(id);
}

const STRING_VALUE_MAX = 200;

/**
 * One property on a flight. `value` is always a string, the same convention
 * as the rest of the form: a decimal/integer input holds intermediate typing
 * state ("1.") that a number can't, and it's what the stored JSON carries.
 * Validation depends on the property's declared type, so it's a
 * `superRefine` keyed off `propertyId` rather than a plain object shape.
 */
export const flightPropertyEntrySchema = z
  .object({
    propertyId: z.string(),
    value: z.string().trim(),
  })
  .superRefine((entry, ctx) => {
    const def = PROPERTY_TYPES_BY_ID.get(entry.propertyId);
    if (!def) {
      ctx.addIssue({
        code: 'custom',
        message: 'Unknown property',
        path: ['propertyId'],
      });
      return;
    }

    const issue = (message: string) =>
      ctx.addIssue({ code: 'custom', message, path: ['value'] });

    // An added property row with nothing in it isn't a property — and the
    // shared patterns both accept "" (and DECIMAL_PATTERN accepts "."), so
    // require real content before checking the shape.
    if (entry.value === '') {
      issue('Required');
      return;
    }

    switch (def.type) {
      case 'decimal':
        if (!DECIMAL_PATTERN.test(entry.value) || !/\d/.test(entry.value)) issue('Enter a number');
        break;
      case 'integer':
        if (!INTEGER_PATTERN.test(entry.value)) issue('Enter a whole number');
        break;
      case 'string':
        if (entry.value.length > STRING_VALUE_MAX) issue('Too long');
        break;
    }
  });

export type FlightPropertyEntry = z.infer<typeof flightPropertyEntrySchema>;

/** The `properties` array on the flight form: each entry valid, no property added twice. */
export const flightPropertiesField = () =>
  z.array(flightPropertyEntrySchema).superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.propertyId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Property added twice',
          path: [index, 'propertyId'],
        });
      }
      seen.add(entry.propertyId);
    });
  });

/**
 * Reads `flights.properties` (a bare PocketBase json field: `null` on rows
 * that predate the field, since PocketBase json fields have no default)
 * back into well-formed entries. Anything malformed or naming a property
 * outside the current catalog is dropped rather than thrown on — a stored
 * flight should always load.
 */
export function parseStoredFlightProperties(raw: unknown): Array<FlightPropertyEntry> {
  if (!Array.isArray(raw)) return [];
  const out: Array<FlightPropertyEntry> = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { propertyId, value } = item as Record<string, unknown>;
    if (typeof propertyId !== 'string' || typeof value !== 'string') continue;
    if (!PROPERTY_TYPES_BY_ID.has(propertyId) || seen.has(propertyId)) continue;
    seen.add(propertyId);
    out.push({ propertyId, value });
  }
  return out;
}
