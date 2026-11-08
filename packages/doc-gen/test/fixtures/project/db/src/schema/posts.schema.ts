import { numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.schema';

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id),
  editorId: uuid('editor_id').references(() => users.id),
  title: text('title').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }),
}).enableRLS();
