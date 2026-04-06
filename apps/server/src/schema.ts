import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  sandboxId: text('sandbox_id').notNull(),
  previewUrl: text('preview_url').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  status: text('status', { enum: ['active', 'destroyed'] }).notNull(),
  destroyedAt: text('destroyed_at'),
})

export const messagesTable = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessionsTable.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  isStreaming: integer('is_streaming', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const claudeTurnsTable = sqliteTable('claude_turns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessionsTable.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  claudeSessionId: text('claude_session_id'),
  status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] }).notNull(),
  error: text('error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
