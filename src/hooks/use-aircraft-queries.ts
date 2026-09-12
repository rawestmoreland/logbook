import { AircraftApi } from '@/lib/api/aircraft';
import { useQuery } from '@tanstack/react-query';

export function useAircraft() {
  return useQuery({
    queryKey: ['aircraft'],
    queryFn: async () => await AircraftApi.getAircraft(),
  });
}
