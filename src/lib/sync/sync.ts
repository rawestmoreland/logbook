import { database } from '@/lib/db';
import { synchronize } from '@nozbe/watermelondb/sync';
import { pb } from './pocketbase';

// Maps a local table name to its PocketBase collection name. Keep these equal
// unless you have a reason not to — it makes the mapper functions below easier
// to read and avoids a second layer of naming to keep in sync.
const TABLES = [
  'pilots',
  'aircraft',
  'flights',
  'endorsements',
  'regulatory_profiles',
] as const;
type TableName = (typeof TABLES)[number];

/**
 * Converts a PocketBase record into WatermelonDB's raw column shape.
 * Only `flights` is fully implemented as a worked example — extend the other
 * cases the same way as you build out each screen.
 */
function pbToWatermelon(table: TableName, record: any) {
  const base = {
    id: record.id, // synchronize() uses this as the pb_id lookup key on pull
    pb_id: record.id,
    pb_updated_at: new Date(record.updated).getTime(),
  };

  switch (table) {
    case 'flights':
      return {
        ...base,
        pilot_id: record.pilot,
        aircraft_id: record.aircraft,
        date: new Date(record.date).getTime(),
        route_from: record.route_from,
        route_to: record.route_to,
        total_time: record.total_time,
        pic_time: record.pic_time,
        sic_time: record.sic_time,
        dual_time: record.dual_time,
        solo_time: record.solo_time,
        night_time: record.night_time,
        actual_instrument: record.actual_instrument,
        sim_instrument: record.sim_instrument,
        day_landings: record.day_landings,
        night_landings: record.night_landings,
        remarks: record.remarks,
        instructor_id: record.instructor,
        endorsement_id: record.endorsement,
      };
    case 'aircraft':
      return {
        ...base,
        user_id: record.user,
        tail_number: record.tail_number,
        type: record.type,
        category_class: record.category_class,
        complex: record.complex,
        high_performance: record.high_performance,
        tailwheel: record.tailwheel,
      };
    // TODO: pilots, endorsements, regulatory_profiles
    default:
      return base;
  }
}

/** Inverse of pbToWatermelon — local record -> PocketBase field shape. */
function watermelonToPb(table: TableName, record: any) {
  switch (table) {
    case 'flights':
      return {
        pilot: record.pilotId,
        aircraft: record.aircraftId,
        date: new Date(record.date).toISOString(),
        route_from: record.routeFrom,
        route_to: record.routeTo,
        total_time: record.totalTime,
        pic_time: record.picTime,
        sic_time: record.sicTime,
        dual_time: record.dualTime,
        solo_time: record.soloTime,
        night_time: record.nightTime,
        actual_instrument: record.actualInstrument,
        sim_instrument: record.simInstrument,
        day_landings: record.dayLandings,
        night_landings: record.nightLandings,
        remarks: record.remarks,
        instructor: record.instructorId,
        endorsement: record.endorsementId,
        deleted: false,
      };
    case 'aircraft':
      return {
        user: record.userId,
        tail_number: record.tailNumber,
        type: record.type,
        category_class: record.categoryClass,
        complex: record.complex,
        high_performance: record.highPerformance,
        tailwheel: record.tailwheel,
        deleted: false,
      };
    // TODO: pilots, endorsements, regulatory_profiles
    default:
      return {};
  }
}

/**
 * PocketBase has no built-in tombstones, so deletions are modeled as a
 * `deleted: boolean` field on every collection (default false). Add this
 * field when you create each collection in the PocketBase admin UI.
 */
export async function synchronizeWithPocketBase() {
  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt }) => {
      const since = lastPulledAt
        ? new Date(lastPulledAt).toISOString().replace('T', ' ').slice(0, 19)
        : '1970-01-01 00:00:00';

      const changes: Record<
        string,
        { created: any[]; updated: any[]; deleted: string[] }
      > = {};

      for (const table of TABLES) {
        const active = await pb.collection(table).getFullList({
          filter: `updated >= "${since}" && deleted = false`,
        });
        const tombstoned = await pb.collection(table).getFullList({
          filter: `updated >= "${since}" && deleted = true`,
        });

        changes[table] = {
          // PocketBase doesn't distinguish created vs. updated on read;
          // WatermelonDB upserts on `updated` either way, so lumping them
          // here is safe.
          created: [],
          updated: active.map((r) => pbToWatermelon(table, r)),
          deleted: tombstoned.map((r) => r.id),
        };
      }

      return { changes, timestamp: Date.now() };
    },

    pushChanges: async ({ changes }) => {
      for (const table of TABLES) {
        const tableChanges = (changes as any)[table];
        if (!tableChanges) continue;

        for (const record of tableChanges.created) {
          const created = await pb
            .collection(table)
            .create(watermelonToPb(table, record));
          await database.write(async () => {
            const local = await database.get(table).find(record.id);
            await local.update((r: any) => {
              r.pbId = created.id;
              r.pbUpdatedAt = new Date(created.updated).getTime();
            });
          });
        }

        for (const record of tableChanges.updated) {
          if (!record.pbId) continue; // hasn't been created remotely yet — shouldn't happen, but be safe
          await pb
            .collection(table)
            .update(record.pbId, watermelonToPb(table, record));
        }

        for (const recordId of tableChanges.deleted) {
          const local = await database
            .get(table)
            .find(recordId)
            .catch(() => null);
          if (local && (local as any).pbId) {
            await pb
              .collection(table)
              .update((local as any).pbId, { deleted: true });
          }
        }
      }
    },

    // Conflicts (a record changed both locally and remotely since last sync)
    // default to last-write-wins via pb_updated_at. Endorsements are the one
    // place this is risky (instructor signs offline while student edits the
    // flight offline) — consider flagging those for manual review instead of
    // silently overwriting once you build that flow.
  });
}
