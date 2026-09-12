import {
  schemaMigrations,
  addColumns,
} from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'aircraft',
          columns: [{ name: 'user_id', type: 'string', isIndexed: true }],
        }),
      ],
    },
  ],
});
