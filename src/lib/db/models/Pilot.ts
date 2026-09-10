import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Pilot extends Model {
  static table = 'pilots';

  @field('user_id') userId!: string;
  @field('name') name!: string;
  @field('licenses_json') licensesJson!: string;
  @field('medical_expiry') medicalExpiry!: number | null;
  @field('regulatory_profile_id') regulatoryProfileId!: string | null;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;
}
