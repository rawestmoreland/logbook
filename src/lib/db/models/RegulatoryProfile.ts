import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class RegulatoryProfile extends Model {
  static table = 'regulatory_profiles';

  @field('name') name!: string;
  @field('rules_json') rulesJson!: string;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;
}
