import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';
import type { CategoryClass } from '@/constants/aircraft';

export default class Aircraft extends Model {
  static table = 'aircraft';

  @field('user_id') userId!: string;
  @field('tail_number') tailNumber!: string;
  @field('type') type!: string;
  @field('category_class') categoryClass!: CategoryClass;
  @field('complex') complex!: boolean;
  @field('high_performance') highPerformance!: boolean;
  @field('tailwheel') tailwheel!: boolean;
  @field('pb_id') pbId!: string | null;
  @field('pb_updated_at') pbUpdatedAt!: number | null;
}
