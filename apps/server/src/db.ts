import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'fs'
import path from 'path'

const DATA_DIR = path.resolve(__dirname, '../data')
const DB_PATH = path.join(DATA_DIR, 'sessions.db')

mkdirSync(DATA_DIR, { recursive: true })

const sqlite = new Database(DB_PATH)
export const db = drizzle(sqlite)
export { sqlite, DB_PATH }
