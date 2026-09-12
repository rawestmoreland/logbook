import { database } from '@/lib/db';
import Aircraft from '@/lib/db/models/Aircraft';

export const AircraftApi = {
  getAircraft: async () => {
    const data = await database.get<Aircraft>('aircraft').query().fetch();
    return data ?? [];
  },
};
