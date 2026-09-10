import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Aircraft extends Model {
  static table = 'aircraft';

  @field('tail_number') tailNumber!: string;
  @field('type') type!: string;
  @field('category_class') categoryClass!: string;
  @field('complex') complex!: boolean;
  @field('high_performance') highPerformance!: boolean;
  @field('tailwheel') tailwheel!: boolean;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;
}
