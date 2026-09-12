import { Model, Relation } from '@nozbe/watermelondb';
import { field, date, relation } from '@nozbe/watermelondb/decorators';

import type Pilot from './Pilot';
import type Aircraft from './Aircraft';
import type Endorsement from './Endorsement';

export default class Flight extends Model {
  static table = 'flights';

  @field('pilot_id') pilotId!: string;
  @field('aircraft_id') aircraftId!: string;
  @date('date') date!: Date;
  @field('route_from') routeFrom!: string;
  @field('route_to') routeTo!: string;
  @field('total_time') totalTime!: number;
  @field('pic_time') picTime!: number;
  @field('sic_time') sicTime!: number;
  @field('dual_time') dualTime!: number;
  @field('solo_time') soloTime!: number;
  @field('night_time') nightTime!: number;
  @field('actual_instrument') actualInstrument!: number;
  @field('sim_instrument') simInstrument!: number;
  @field('day_landings') dayLandings!: number;
  @field('night_landings') nightLandings!: number;
  @field('remarks') remarks!: string | null;
  @field('instructor_id') instructorId!: string | null;
  @field('endorsement_id') endorsementId!: string | null;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;

  @relation('pilots', 'pilot_id') pilot!: Relation<Pilot>;
  @relation('aircraft', 'aircraft_id') aircraft!: Relation<Aircraft>;
  @relation('pilots', 'instructor_id') instructor!: Relation<Pilot>;
  @relation('endorsements', 'endorsement_id') endorsement!: Relation<Endorsement>;
}
