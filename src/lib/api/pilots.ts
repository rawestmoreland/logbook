import { Q } from '@nozbe/watermelondb';

import { database } from '@/lib/db';
import Pilot from '@/lib/db/models/Pilot';
import { pb } from '@/lib/sync/pocketbase';

/**
 * `pilots` sync (pbToWatermelon/watermelonToPb) isn't implemented yet (see
 * sync.ts TODOs), so this only reads/creates the local row — it'll pick up
 * a pb_id once that mapper exists.
 */
export async function getOrCreateLocalPilot(): Promise<Pilot> {
  const userId = pb.authStore.record?.id;
  if (!userId) throw new Error('Not signed in');

  const pilots = database.get<Pilot>('pilots');
  const existing = await pilots.query(Q.where('user_id', userId)).fetch();
  if (existing[0]) return existing[0];

  return database.write(() =>
    pilots.create((pilot) => {
      pilot.userId = userId;
      pilot.name = pb.authStore.record?.email ?? '';
      pilot.licensesJson = '[]';
      pilot.medicalExpiry = null;
      pilot.regulatoryProfileId = null;
      pilot.pbId = null;
      pilot.pbUpdatedAt = null;
    }),
  );
}
