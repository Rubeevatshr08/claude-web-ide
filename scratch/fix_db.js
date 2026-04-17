const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('apps/server/data/sessions.db');

try {
  const db = new Database(dbPath);
  console.log('Opened database at:', dbPath);
  
  // Check if column exists
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
  const hasColumn = tableInfo.some(col => col.name === 'orchestrator_url');
  
  if (!hasColumn) {
    db.exec("ALTER TABLE sessions ADD COLUMN orchestrator_url TEXT NOT NULL DEFAULT '';");
    console.log('Successfully added orchestrator_url column');
  } else {
    console.log('Column orchestrator_url already exists');
  }
  
  db.close();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
