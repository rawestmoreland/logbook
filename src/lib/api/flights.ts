import { database } from '@/lib/db';
import Flight from '@/lib/db/models/Flight';
import { parseDateValue, parseNumberValue } from '@/lib/forms/flight-form';

type CreateFlightInput = {
  pilotId: string;
  aircraftId: string;
  date: string;
  routeFrom: string;
  routeTo: string;
  totalTime: string;
  picTime: string;
  sicTime: string;
  dualTime: string;
  soloTime: string;
  nightTime: string;
  actualInstrument: string;
  simInstrument: string;
  dayLandings: string;
  nightLandings: string;
  remarks?: string;
};

export async function createFlight(input: CreateFlightInput): Promise<Flight> {
  return database.write(() =>
    database.get<Flight>('flights').create((flight) => {
      flight.pilotId = input.pilotId;
      flight.aircraftId = input.aircraftId;
      flight.date = parseDateValue(input.date);
      flight.routeFrom = input.routeFrom.trim().toUpperCase();
      flight.routeTo = input.routeTo.trim().toUpperCase();
      flight.totalTime = parseNumberValue(input.totalTime);
      flight.picTime = parseNumberValue(input.picTime);
      flight.sicTime = parseNumberValue(input.sicTime);
      flight.dualTime = parseNumberValue(input.dualTime);
      flight.soloTime = parseNumberValue(input.soloTime);
      flight.nightTime = parseNumberValue(input.nightTime);
      flight.actualInstrument = parseNumberValue(input.actualInstrument);
      flight.simInstrument = parseNumberValue(input.simInstrument);
      flight.dayLandings = parseNumberValue(input.dayLandings);
      flight.nightLandings = parseNumberValue(input.nightLandings);
      flight.remarks = input.remarks?.trim() || null;
      flight.instructorId = null;
      flight.endorsementId = null;
      flight.pbId = null;
      flight.pbUpdatedAt = null;
    }),
  );
}
