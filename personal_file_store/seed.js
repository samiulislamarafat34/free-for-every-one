const fs = require('fs/promises');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, 'data');
const STATE_COLLECTION = 'app_state';

const files = [
  ['files', []],
  ['folders', []],
  ['notes', []],
  ['contacts', []],
  ['devices', []],
  ['settings', {}],
  ['users', {}],
  ['profile', {}]
];

async function readLocalJson(name, fallback) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, `${name}.json`), 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function seed() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required. Copy .env.example to .env and fill it first.');
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'personal_file_store');

  for (const [name, fallback] of files) {
    const value = await readLocalJson(name, fallback);
    await db.collection(STATE_COLLECTION).updateOne(
      { _id: name },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log(`Migrated ${name}.json to MongoDB`);
  }

  await client.close();
  console.log('MongoDB migration complete.');
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
