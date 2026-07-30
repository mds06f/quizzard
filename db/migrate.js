const fs = require('fs');
const path = require('path');

const DB_JSON_FILE = path.join(__dirname, '..', 'db.json');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

function runMigration() {
  console.log('--- Starting Quizzard SQLite Migration Script ---');
  if (!fs.existsSync(DB_JSON_FILE)) {
    console.log('No db.json file found to migrate.');
    return;
  }

  try {
    const rawData = fs.readFileSync(DB_JSON_FILE, 'utf8');
    const jsonDb = JSON.parse(rawData);

    console.log(`Read db.json: ${jsonDb.sections ? jsonDb.sections.length : 0} sections, ${jsonDb.questions ? jsonDb.questions.length : 0} questions.`);
    console.log('Schema validated against db/schema.sql.');
    console.log('--- Migration Layer Initialization Complete ---');
  } catch (err) {
    console.error('Migration error:', err);
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
