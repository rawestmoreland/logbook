import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';

import { database } from '@/lib/db';
import Aircraft from '@/lib/db/models/Aircraft';
import Flight from '@/lib/db/models/Flight';

/**
 * Aircraft used on the pilot's most recent flights, most recent first and
 * deduped. Used to power the "quick pick" pills on the new-flight form and
 * the "Recent" section of the aircraft picker.
 */
export function useRecentAircraft(limit = 3) {
  const [recent, setRecent] = useState<Aircraft[]>([]);

  useEffect(() => {
    let cancelled = false;

    database
      .get<Flight>('flights')
      .query(Q.sortBy('date', Q.desc), Q.take(50))
      .fetch()
      .then(async (flights) => {
        if (cancelled) return;

        const seen = new Set<string>();
        const orderedIds: string[] = [];
        for (const flight of flights) {
          if (seen.has(flight.aircraftId)) continue;
          seen.add(flight.aircraftId);
          orderedIds.push(flight.aircraftId);
          if (orderedIds.length >= limit) break;
        }

        const aircraftTable = database.get<Aircraft>('aircraft');
        const aircraft = await Promise.all(
          orderedIds.map((id) => aircraftTable.find(id).catch(() => null)),
        );

        if (!cancelled) {
          setRecent(aircraft.filter((a): a is Aircraft => a !== null));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return recent;
}
