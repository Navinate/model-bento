import { pgTable, uuid, bigint, text, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: bigint('github_id', { mode: 'number' }).unique().notNull(),
  username: text('username').notNull(),
  avatarUrl: text('avatar_url'),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  bannedReason: text('banned_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  unique().on(table.provider, table.name),
]);

export const bentoPages = pgTable('bento_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: uuid('model_id').unique().references(() => models.id, { onDelete: 'cascade' }),
  layout: jsonb('layout').notNull(),
  extracted: jsonb('extracted').notNull(),
  sourceType: text('source_type').notNull().default('text'),
  ogImageUrl: text('og_image_url'),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const sourceTexts = pgTable('source_texts', {
  id: uuid('id').primaryKey().defaultRandom(),
  modelId: uuid('model_id').unique().references(() => models.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const generationJobs = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  batchId: text('batch_id').notNull(),
  sourceText: text('source_text').notNull(),
  sourceType: text('source_type').notNull().default('text'),
  status: text('status').notNull().default('processing'),
  extracted: jsonb('extracted'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
