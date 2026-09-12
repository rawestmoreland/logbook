import { useEffect, useState } from 'react';

import { database } from '@/lib/db';
import Aircraft from '@/lib/db/models/Aircraft';

/**
 * Suggests `type` values (e.g. "Cessna 172") from the user's own previously
 * entered aircraft. Aircraft `type` is free text (unlike `category_class`,
 * it's too open-ended a set to make a closed enum), so this is the
 * low-effort guard against a pilot's own fleet accumulating "C172" /
 * "C-172" / "Cessna 172" as separate values.
 */
export function useAircraftTypeSuggestions(query: string = '') {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    database
      .get<Aircraft>('aircraft')
      .query()
      .fetch()
      .then((records) => {
        if (cancelled) return;

        // Deduped case-insensitively, keeping the first casing seen for
        // each type.
        const seen = new Map<string, string>();
        for (const aircraft of records) {
          const type = aircraft.type?.trim();
          if (!type) continue;
          const key = type.toLowerCase();
          if (!seen.has(key)) seen.set(key, type);
        }

        const normalizedQuery = query.trim().toLowerCase();
        const types = [...seen.values()].filter((type) =>
          normalizedQuery
            ? type.toLowerCase().includes(normalizedQuery)
            : true,
        );

        setSuggestions(types);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return suggestions;
}
