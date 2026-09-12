import { Model, Relation } from '@nozbe/watermelondb';
import { field, date, relation } from '@nozbe/watermelondb/decorators';

import type Flight from './Flight';
import type Pilot from './Pilot';

export default class Endorsement extends Model {
  static table = 'endorsements';

  @field('flight_id') flightId!: string;
  @field('instructor_id') instructorId!: string;
  @field('text') text!: string;
  @field('signature_uri') signatureUri!: string | null;
  @date('date') date!: Date;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;

  @relation('flights', 'flight_id') flight!: Relation<Flight>;
  @relation('pilots', 'instructor_id') instructor!: Relation<Pilot>;
}
