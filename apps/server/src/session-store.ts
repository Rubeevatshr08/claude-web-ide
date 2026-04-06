import { eq, desc } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import { db } from './db'
import { sessionsTable } from './schema'

export interface SessionRecord {
  id: string
  sandboxId: string
  previewUrl: string
  createdAt: string
  updatedAt: string
  status: 'active' | 'destroyed'
  destroyedAt?: string
}

let initialized = false

export async function initSessionStore(): Promise<void> {
  if (initialized) return

  migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../drizzle'),
  })
  initialized = true
}

export async function listSessionRecords(): Promise<SessionRecord[]> {
  await initSessionStore()
  const rows = db.select().from(sessionsTable).orderBy(desc(sessionsTable.updatedAt)).all()
  return rows.map((row) => ({
    id: row.id,
    sandboxId: row.sandboxId,
    previewUrl: row.previewUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    destroyedAt: row.destroyedAt ?? undefined,
  }))
}

export async function upsertSessionRecord(record: SessionRecord): Promise<void> {
  await initSessionStore()
  db.insert(sessionsTable)
    .values({
      id: record.id,
      sandboxId: record.sandboxId,
      previewUrl: record.previewUrl,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: record.status,
      destroyedAt: record.destroyedAt ?? null,
    })
    .onConflictDoUpdate({
      target: sessionsTable.id,
      set: {
        sandboxId: record.sandboxId,
        previewUrl: record.previewUrl,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status: record.status,
        destroyedAt: record.destroyedAt ?? null,
      },
    })
    .run()
}

export async function markSessionDestroyed(id: string): Promise<void> {
  await initSessionStore()
  const existing = db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).get()
  if (!existing) return

  db.update(sessionsTable)
    .set({
      status: 'destroyed',
      updatedAt: new Date().toISOString(),
      destroyedAt: new Date().toISOString(),
    })
    .where(eq(sessionsTable.id, id))
    .run()
}
