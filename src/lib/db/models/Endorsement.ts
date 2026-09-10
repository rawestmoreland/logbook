import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Endorsement extends Model {
  static table = 'endorsements';

  @field('flight_id') flightId!: string;
  @field('instructor_id') instructorId!: string;
  @field('text') text!: string;
  @field('signature_uri') signatureUri!: string | null;
  @date('date') date!: Date;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;
}
