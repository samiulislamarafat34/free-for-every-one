const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://samiulislamarafat34:sia%4047874634@amanat-storage.yjwhqvm.mongodb.net/?appName=amanat-storage';

async function seed() {
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db('amanat-storage');

  const users = {
    admin: {
      passwordHash: bcrypt.hashSync('admin123', 10),
      name: 'Admin',
      email: 'admin@amanat.com',
      mobile: '0000000000',
      telegramChatId: null,
      storageLimit: 10 * 1024 * 1024 * 1024,
      createdAt: Date.now(),
      status: 'active'
    },
    'samiul.islam.arafat34': {
      passwordHash: '$2a$10$pbUEPpaJIGGq6hqWSq8I2e3TNz/KGVxC/L9cm6uWUZY1d8fipl65m',
      name: 'Samiul Islam Arafat',
      email: 'samiul@example.com',
      mobile: '01700000000',
      storageLimit: 10 * 1024 * 1024 * 1024,
      createdAt: 1778870354099,
      status: 'active'
    },
    'samiya.salam.ispa': {
      passwordHash: '$2a$10$XvdfRRfQdCX2RveLXE.7nufLHhSA1L5lKtJ0DjffJjU/tz45855Re',
      name: 'Samiya Salam',
      email: 'samiya@example.com',
      mobile: '01800000000',
      telegramChatId: null,
      storageLimit: 10 * 1024 * 1024 * 1024,
      createdAt: 1778900636317,
      status: 'active'
    }
  };

  await db.collection('users').replaceOne(
    { _id: 'allUsers' },
    { data: users },
    { upsert: true }
  );

  console.log('Users seeded successfully!');
  await client.close();
}

seed().catch(console.error);