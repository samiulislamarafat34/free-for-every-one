const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const multer = require('multer');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOGIN_USERNAME = process.env.LOGIN_USERNAME || 'admin';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'password123';
const STORAGE_LIMIT = Number(process.env.STORAGE_LIMIT || 10 * 1024 * 1024 * 1024);

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const FILES_PATH = path.join(DATA_DIR, 'files.json');
const FOLDERS_PATH = path.join(DATA_DIR, 'folders.json');
const NOTES_PATH = path.join(DATA_DIR, 'notes.json');
const CONTACTS_PATH = path.join(DATA_DIR, 'contacts.json');
const DEVICES_PATH = path.join(DATA_DIR, 'devices.json');
const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const PROFILE_PATH = path.join(DATA_DIR, 'profile.json');
const STATE_COLLECTION = 'app_state';

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (error) {
  if (!process.env.VERCEL) throw error;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024,
    files: 100
  }
});

let mongoClientPromise = null;
const otpStore = new Map();
const sessions = new Map();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf('=');
      return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
    }));
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `amanat_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'amanat_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

async function saveSession(token, session) {
  sessions.set(token, session);
  const client = await getMongoClient();
  if (!client) return;
  const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
  await db.collection('sessions').updateOne(
    { _id: token },
    { $set: { ...session, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function deleteSession(token) {
  sessions.delete(token);
  const client = await getMongoClient();
  if (!client) return;
  const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
  await db.collection('sessions').deleteOne({ _id: token });
}

async function getSession(req) {
  const token = readCookies(req).amanat_session;
  if (!token) return null;
  let session = sessions.get(token);
  if (!session) {
    const client = await getMongoClient();
    if (client) {
      const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
      session = await db.collection('sessions').findOne({ _id: token });
      if (session) sessions.set(token, session);
    }
  }
  if (!session || session.expiresAt < Date.now()) {
    await deleteSession(token);
    return null;
  }
  return session;
}

async function requireAuth(req, res, next) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ success: false, msg: 'Login required.' });
  req.user = session;
  next();
}

async function readJson(filePath, fallback) {
  const client = await getMongoClient();
  if (client) {
    const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
    const key = path.basename(filePath, '.json');
    const doc = await db.collection(STATE_COLLECTION).findOne({ _id: key });
    if (doc && Object.prototype.hasOwnProperty.call(doc, 'value')) return doc.value;
  }

  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  const client = await getMongoClient();
  if (client) {
    const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
    const key = path.basename(filePath, '.json');
    await db.collection(STATE_COLLECTION).updateOne(
      { _id: key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
    return;
  }

  await fsp.writeFile(filePath, JSON.stringify(value, null, 2));
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function getFileType(file) {
  const mime = file.mimeType || file.mimetype || '';
  const name = (file.name || file.originalname || '').toLowerCase();
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) return 'text';
  if (name.endsWith('.vcf') || name.endsWith('.csv')) return 'contact';
  return 'file';
}

function normalizeLegacyFile(file) {
  const generatedId = crypto
    .createHash('sha1')
    .update(`${file.telegramFileId || file.localUrl || file.name}-${file.uploadedAt || ''}`)
    .digest('hex')
    .slice(0, 16);

  return {
    id: file.id || generatedId,
    name: file.name || 'Untitled file',
    type: file.type === 'docs' ? 'pdf' : (file.type || getFileType(file)),
    category: file.category || mapTypeToCategory(file.type === 'docs' ? 'pdf' : file.type),
    folderId: file.folderId || '',
    size: Number(file.size || 0),
    mimeType: file.mimeType || '',
    telegramFileId: file.telegramFileId || null,
    localUrl: file.localUrl || null,
    uploadedAt: file.uploadedAt || Date.now(),
    ownerUsername: file.ownerUsername || LOGIN_USERNAME
  };
}

function mapTypeToCategory(type) {
  if (type === 'photo') return 'photos';
  if (type === 'video') return 'videos';
  if (type === 'pdf') return 'pdfs';
  if (type === 'text') return 'texts';
  if (type === 'contact') return 'contacts';
  return 'files';
}

function safeSettings(settings) {
  return {
    telegramChatId: settings.telegramChatId || process.env.TELEGRAM_CHAT_ID || '',
    telegramConnected: Boolean(settings.telegramConnected || (settings.telegramBotToken && settings.telegramChatId)),
    assistantApiKeySet: Boolean(settings.assistantApiKey),
    assistantModel: settings.assistantModel || 'gpt-4.1-mini',
    siteName: settings.siteName || 'Amanat Cloud'
  };
}

function passwordHash(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

async function validateCredentials(username, password) {
  const users = await readJson(USERS_PATH, {});
  const user = users[username];
  if (username === LOGIN_USERNAME) {
    return password === LOGIN_PASSWORD
      || user?.passwordSha256 === passwordHash(password)
      || (user?.passwordHash && bcrypt.compareSync(String(password || ''), user.passwordHash));
  }
  return Boolean(user && user.status !== 'suspended' && (
    user.passwordSha256 === passwordHash(password)
    || (user.passwordHash && bcrypt.compareSync(String(password || ''), user.passwordHash))
  ));
}

async function userExists(username) {
  if (username === LOGIN_USERNAME) return true;
  const users = await readJson(USERS_PATH, {});
  return Boolean(users[username]);
}

function makeOtp() {
  return String(crypto.randomInt(100000, 999999));
}

async function sendTelegramMessage(message) {
  const settings = await getSettings();
  if (!settings.telegramBotToken || !settings.telegramChatId) {
    throw new Error('Telegram bot token and chat ID are not set.');
  }

  const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settings.telegramChatId,
      text: message
    })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || 'Telegram message failed.');
  return result;
}

async function sendOtp(username, purpose) {
  const code = makeOtp();
  const key = `${purpose}:${username}`;
  const item = {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000
  };
  otpStore.set(key, item);
  const client = await getMongoClient();
  if (client) {
    const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
    await db.collection('otps').updateOne(
      { _id: key },
      { $set: { ...item, username, purpose, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  await sendTelegramMessage(`Amanat Cloud OTP\nUser: ${username}\nCode: ${code}\nThis code will expire in 5 minutes.`);
}

async function verifyOtp(username, purpose, code) {
  const key = `${purpose}:${username}`;
  let item = otpStore.get(key);
  if (!item) {
    const client = await getMongoClient();
    if (client) {
      const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
      item = await db.collection('otps').findOne({ _id: key });
      if (item) otpStore.set(key, item);
    }
  }
  if (!item || item.expiresAt < Date.now()) {
    otpStore.delete(key);
    const client = await getMongoClient();
    if (client) {
      const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
      await db.collection('otps').deleteOne({ _id: key });
    }
    return false;
  }
  if (String(code || '').trim() !== item.code) return false;
  otpStore.delete(key);
  const client = await getMongoClient();
  if (client) {
    const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
    await db.collection('otps').deleteOne({ _id: key });
  }
  return true;
}

function safeUsers(users) {
  return Object.entries(users).map(([username, user]) => ({
    username,
    status: user.status || 'active',
    createdAt: user.createdAt || null
  }));
}

async function getSettings() {
  const saved = await readJson(SETTINGS_PATH, {});
  return {
    telegramBotToken: saved.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: saved.telegramChatId || process.env.TELEGRAM_CHAT_ID || '',
    telegramConnected: Boolean(saved.telegramConnected),
    assistantApiKey: saved.assistantApiKey || '',
    assistantModel: saved.assistantModel || 'gpt-4.1-mini',
    siteName: saved.siteName || 'Amanat Cloud'
  };
}

function defaultProfile() {
  return {
    fullNameEnglish: '',
    fullNameBangla: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    facebook: '',
    bloodGroup: '',
    education: '',
    occupation: '',
    fatherName: '',
    motherName: '',
    spouseName: '',
    presentAddress: '',
    permanentAddress: '',
    nidStatus: 'Not applied',
    documents: [
      'Birth Registration Certificate',
      'Educational Certificate',
      'Parent NID Copy',
      'Utility Bill or Address Proof',
      'Passport Size Photo'
    ],
    updatedAt: null
  };
}

async function getMongoClient() {
  if (!process.env.MONGODB_URI) return null;
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(process.env.MONGODB_URI)
      .connect()
      .catch((error) => {
        console.warn('MongoDB connection skipped:', error.message);
        mongoClientPromise = null;
        return null;
      });
  }
  return mongoClientPromise;
}

async function mirrorToMongo(collection, document) {
  const client = await getMongoClient();
  if (!client) return;
  const db = client.db(process.env.MONGODB_DB || 'personal_file_store');
  await db.collection(collection).updateOne(
    { id: document.id },
    { $set: { ...document, mirroredAt: new Date() } },
    { upsert: true }
  ).catch((error) => console.warn(`MongoDB mirror failed for ${collection}:`, error.message));
}

async function uploadToTelegram(file, settings) {
  if (!settings.telegramBotToken || !settings.telegramChatId) return null;

  const type = getFileType(file);
  const endpoint = type === 'photo' ? 'sendPhoto' : type === 'video' ? 'sendVideo' : 'sendDocument';
  const field = type === 'photo' ? 'photo' : type === 'video' ? 'video' : 'document';
  const form = new FormData();
  form.append('chat_id', settings.telegramChatId);
  form.append('caption', file.originalname);
  form.append(field, new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), file.originalname);

  const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/${endpoint}`, {
    method: 'POST',
    body: form
  });
  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.description || 'Telegram upload failed');
  }

  const message = result.result || {};
  if (message.document) return message.document.file_id;
  if (message.video) return message.video.file_id;
  if (message.photo?.length) return message.photo[message.photo.length - 1].file_id;
  return null;
}

async function getTelegramFileUrl(fileId, settings) {
  if (!settings.telegramBotToken || !fileId) return null;
  const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const result = await response.json();
  if (!result.ok || !result.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${settings.telegramBotToken}/${result.result.file_path}`;
}

async function saveLocalFallback(file) {
  if (process.env.VERCEL) {
    throw new Error('Telegram must be connected before uploading on Vercel.');
  }
  const cleanName = file.originalname.replace(/[^\w.\- ]+/g, '_');
  const fileName = `${Date.now()}_${cleanName}`;
  const fullPath = path.join(UPLOAD_DIR, fileName);
  await fsp.writeFile(fullPath, file.buffer);
  return `/uploads/${fileName}`;
}

function buildStorageStats(files) {
  const normalized = files.map(normalizeLegacyFile);
  const byType = normalized.reduce((acc, file) => {
    const key = file.type || 'file';
    acc[key] = (acc[key] || 0) + file.size;
    return acc;
  }, {});
  const used = normalized.reduce((sum, file) => sum + Number(file.size || 0), 0);
  return {
    used,
    limit: STORAGE_LIMIT,
    percent: Math.min(100, Math.round((used / STORAGE_LIMIT) * 100)),
    totalFiles: normalized.length,
    byType
  };
}

app.post('/login/request-otp', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, msg: 'Username and password are required.' });
  if (!(await validateCredentials(username, password))) {
    return res.status(401).json({ success: false, msg: 'Invalid username or password.' });
  }
  try {
    await sendOtp(username, 'login');
    res.json({ success: true, msg: 'OTP sent to Telegram.' });
  } catch (error) {
    res.status(400).json({ success: false, msg: error.message });
  }
});

app.post('/login', async (req, res) => {
  const { username, password, otp } = req.body;

  if ((await validateCredentials(username, password)) && await verifyOtp(username, 'login', otp)) {
    const devices = await readJson(DEVICES_PATH, []);
    const userAgent = req.get('user-agent') || 'Unknown device';
    const hash = crypto.createHash('sha1').update(userAgent).digest('hex').slice(0, 12);
    const device = {
      id: hash,
      name: userAgent.includes('Mobile') ? 'Mobile browser' : 'Desktop browser',
      userAgent,
      location: req.get('x-vercel-ip-city') || req.get('cf-ipcity') || 'Unknown location',
      ip: req.ip,
      status: 'active',
      lastLogin: nowIso()
    };
    const nextDevices = [device, ...devices.filter((item) => item.id !== hash)].slice(0, 20);
    await writeJson(DEVICES_PATH, nextDevices);
    const token = crypto.randomBytes(32).toString('hex');
    await saveSession(token, {
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
    });
    setSessionCookie(res, token);
    return res.json({ success: true, msg: 'Login successful', username });
  }
  return res.status(401).json({ success: false, msg: 'Invalid credentials or OTP.' });
});

app.post('/logout', async (req, res) => {
  const token = readCookies(req).amanat_session;
  if (token) await deleteSession(token);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.post('/password/forgot/request-otp', async (req, res) => {
  const { username } = req.body;
  if (!username || !(await userExists(username))) {
    return res.status(404).json({ success: false, msg: 'User not found.' });
  }
  try {
    await sendOtp(username, 'forgot');
    res.json({ success: true, msg: 'Password reset OTP sent to Telegram.' });
  } catch (error) {
    res.status(400).json({ success: false, msg: error.message });
  }
});

app.post('/password/forgot/reset', async (req, res) => {
  const { username, otp, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, msg: 'Password must be at least 6 characters.' });
  }
  if (!await verifyOtp(username, 'forgot', otp)) {
    return res.status(401).json({ success: false, msg: 'Invalid or expired OTP.' });
  }
  const users = await readJson(USERS_PATH, {});
  users[username] = {
    ...(users[username] || {}),
    username,
    passwordSha256: passwordHash(newPassword),
    status: 'active',
    updatedAt: Date.now(),
    createdAt: users[username]?.createdAt || Date.now()
  };
  await writeJson(USERS_PATH, users);
  res.json({ success: true, msg: 'Password changed. You can login now.' });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    database: process.env.MONGODB_URI ? 'mongodb' : 'local-json',
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    timestamp: Date.now()
  });
});

app.get('/dashboard.html', async (req, res) => {
  if (!await getSession(req)) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.use('/api', requireAuth);

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/api/overview', async (req, res) => {
  const files = await readJson(FILES_PATH, []);
  const folders = await readJson(FOLDERS_PATH, []);
  const notes = await readJson(NOTES_PATH, []);
  const contacts = await readJson(CONTACTS_PATH, []);
  const settings = await getSettings();
  res.json({
    stats: buildStorageStats(files),
    counts: {
      folders: folders.length,
      notes: notes.length,
      contacts: contacts.length
    },
    settings: safeSettings(settings),
    user: { username: req.user?.username || LOGIN_USERNAME },
    nameIdeas: ['Amanat Cloud', 'StudyVault', 'Nirob Drive', 'ClassNest', 'SafeShelf']
  });
});

app.get('/api/profile', async (req, res) => {
  const saved = await readJson(PROFILE_PATH, {});
  const profile = {
    ...defaultProfile(),
    ...saved,
    username: req.user?.username || LOGIN_USERNAME
  };
  res.json(profile);
});

app.post('/api/profile', async (req, res) => {
  const current = await readJson(PROFILE_PATH, {});
  const allowed = [
    'fullNameEnglish',
    'fullNameBangla',
    'dateOfBirth',
    'email',
    'phone',
    'facebook',
    'bloodGroup',
    'education',
    'occupation',
    'fatherName',
    'motherName',
    'spouseName',
    'presentAddress',
    'permanentAddress',
    'nidStatus'
  ];
  const next = { ...defaultProfile(), ...current };
  for (const key of allowed) next[key] = req.body[key] || '';
  next.updatedAt = nowIso();
  await writeJson(PROFILE_PATH, next);
  await mirrorToMongo('profiles', { id: req.user?.username || LOGIN_USERNAME, ...next });
  res.json({ success: true, profile: next });
});

app.post('/api/password/change', async (req, res) => {
  const username = req.user?.username || LOGIN_USERNAME;
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, msg: 'Password must be at least 6 characters.' });
  }
  if (!(await validateCredentials(username, currentPassword))) {
    return res.status(401).json({ success: false, msg: 'Current password is not correct.' });
  }
  const users = await readJson(USERS_PATH, {});
  users[username] = {
    ...(users[username] || {}),
    username,
    passwordSha256: passwordHash(newPassword),
    status: 'active',
    updatedAt: Date.now(),
    createdAt: users[username]?.createdAt || Date.now()
  };
  await writeJson(USERS_PATH, users);
  res.json({ success: true, msg: 'Password changed.' });
});

app.get('/api/users', async (req, res) => {
  res.json(safeUsers(await readJson(USERS_PATH, {})));
});

app.post('/api/users', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, msg: 'Username and password are required.' });
  const users = await readJson(USERS_PATH, {});
  if (users[username]) return res.status(400).json({ success: false, msg: 'User already exists.' });
  users[username] = {
    username,
    passwordSha256: passwordHash(password),
    storageLimit: STORAGE_LIMIT,
    status: 'active',
    createdAt: Date.now()
  };
  await writeJson(USERS_PATH, users);
  res.json({ success: true, users: safeUsers(users) });
});

app.get('/api/files', async (req, res) => {
  const files = (await readJson(FILES_PATH, [])).map(normalizeLegacyFile);
  const { category = 'all', folderId = '' } = req.query;
  const filtered = files.filter((file) => {
    const categoryOk = category === 'all' || file.category === category || file.type === category;
    const folderOk = folderId ? file.folderId === folderId : true;
    return categoryOk && folderOk;
  });
  res.json(filtered.sort((a, b) => Number(b.uploadedAt || 0) - Number(a.uploadedAt || 0)));
});

app.post('/api/files/upload', upload.array('files', 100), async (req, res) => {
  const incoming = req.files || [];
  const category = req.body.category || 'files';
  const folderId = req.body.folderId || '';

  if (!incoming.length) return res.status(400).json({ success: false, msg: 'No files selected.' });
  if (category === 'photos' && incoming.length > 100) {
    return res.status(400).json({ success: false, msg: 'You can upload up to 100 photos at once.' });
  }
  if ((category === 'pdfs' || category === 'books') && incoming.filter((file) => getFileType(file) === 'pdf').length > 10) {
    return res.status(400).json({ success: false, msg: 'You can upload up to 10 PDF files at once.' });
  }

  const settings = await getSettings();
  const files = (await readJson(FILES_PATH, [])).map(normalizeLegacyFile);
  const saved = [];

  for (const file of incoming) {
    let telegramFileId = null;
    let localUrl = null;
    if (settings.telegramBotToken && settings.telegramChatId) {
      telegramFileId = await uploadToTelegram(file, settings);
    } else {
      localUrl = await saveLocalFallback(file);
    }

    const type = getFileType(file);
    const storedCategory = category === 'files' ? mapTypeToCategory(type) : category;
    const item = {
      id: id('file'),
      name: file.originalname,
      type,
      category: storedCategory,
      folderId,
      size: file.size,
      mimeType: file.mimetype,
      telegramFileId,
      localUrl,
      uploadedAt: Date.now(),
      ownerUsername: LOGIN_USERNAME
    };
    files.push(item);
    saved.push(item);
    await mirrorToMongo('files', item);
  }

  await writeJson(FILES_PATH, files);
  res.json({ success: true, files: saved, stats: buildStorageStats(files) });
});

app.get('/api/files/:id/view', async (req, res) => {
  const files = (await readJson(FILES_PATH, [])).map(normalizeLegacyFile);
  const file = files.find((item) => item.id === req.params.id);
  if (!file) return res.status(404).send('File not found');
  if (file.localUrl) return res.redirect(file.localUrl);

  const settings = await getSettings();
  const url = await getTelegramFileUrl(file.telegramFileId, settings);
  if (!url) return res.status(404).send('Telegram file is not available');

  const response = await fetch(url);
  if (!response.ok) return res.status(502).send('Could not load file from Telegram');
  res.setHeader('Content-Type', file.mimeType || response.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.send(buffer);
});

app.delete('/api/files/:id', async (req, res) => {
  const files = (await readJson(FILES_PATH, [])).map(normalizeLegacyFile);
  const next = files.filter((item) => item.id !== req.params.id);
  await writeJson(FILES_PATH, next);
  res.json({ success: true, stats: buildStorageStats(next) });
});

app.get('/api/folders', async (req, res) => {
  const folders = await readJson(FOLDERS_PATH, []);
  const { section = 'all' } = req.query;
  res.json(section === 'all' ? folders : folders.filter((folder) => !folder.section || folder.section === section));
});

app.post('/api/folders', async (req, res) => {
  const folders = await readJson(FOLDERS_PATH, []);
  const folder = {
    id: id('folder'),
    name: req.body.name || 'New folder',
    section: req.body.section || 'files',
    icon: req.body.icon || 'fa-folder',
    ownerUsername: LOGIN_USERNAME,
    createdAt: Date.now()
  };
  folders.push(folder);
  await writeJson(FOLDERS_PATH, folders);
  await mirrorToMongo('folders', folder);
  res.json({ success: true, folder });
});

app.put('/api/folders/:id', async (req, res) => {
  const folders = await readJson(FOLDERS_PATH, []);
  const next = folders.map((folder) => folder.id === req.params.id ? { ...folder, name: req.body.name || folder.name } : folder);
  await writeJson(FOLDERS_PATH, next);
  res.json({ success: true });
});

app.delete('/api/folders/:id', async (req, res) => {
  const folders = await readJson(FOLDERS_PATH, []);
  const files = (await readJson(FILES_PATH, [])).map(normalizeLegacyFile);
  await writeJson(FOLDERS_PATH, folders.filter((folder) => folder.id !== req.params.id));
  await writeJson(FILES_PATH, files.map((file) => file.folderId === req.params.id ? { ...file, folderId: '' } : file));
  res.json({ success: true });
});

app.get('/api/notes', async (req, res) => {
  res.json(await readJson(NOTES_PATH, []));
});

app.post('/api/notes', async (req, res) => {
  const notes = await readJson(NOTES_PATH, []);
  const note = {
    id: req.body.id || id('note'),
    title: req.body.title || 'Untitled note',
    content: req.body.content || '',
    updatedAt: nowIso()
  };
  const next = [note, ...notes.filter((item) => item.id !== note.id)];
  await writeJson(NOTES_PATH, next);
  await mirrorToMongo('notes', note);
  res.json({ success: true, note });
});

app.delete('/api/notes/:id', async (req, res) => {
  const notes = await readJson(NOTES_PATH, []);
  await writeJson(NOTES_PATH, notes.filter((note) => note.id !== req.params.id));
  res.json({ success: true });
});

app.get('/api/contacts', async (req, res) => {
  res.json(await readJson(CONTACTS_PATH, []));
});

app.post('/api/contacts', async (req, res) => {
  const contacts = await readJson(CONTACTS_PATH, []);
  const contact = {
    id: id('contact'),
    name: req.body.name || 'Unnamed contact',
    phone: req.body.phone || '',
    note: req.body.note || '',
    createdAt: nowIso()
  };
  contacts.push(contact);
  await writeJson(CONTACTS_PATH, contacts);
  await mirrorToMongo('contacts', contact);
  res.json({ success: true, contact });
});

app.get('/api/devices', async (req, res) => {
  res.json(await readJson(DEVICES_PATH, []));
});

app.get('/api/settings', async (req, res) => {
  res.json(safeSettings(await getSettings()));
});

app.post('/api/settings/telegram', async (req, res) => {
  const current = await getSettings();
  const next = {
    ...current,
    telegramBotToken: req.body.telegramBotToken || current.telegramBotToken,
    telegramChatId: req.body.telegramChatId || current.telegramChatId
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${next.telegramBotToken}/getMe`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.description || 'Telegram bot is not connected.');
    next.telegramConnected = true;
    await writeJson(SETTINGS_PATH, next);
    res.json({ success: true, msg: 'Telegram connected.', settings: safeSettings(next) });
  } catch (error) {
    next.telegramConnected = false;
    await writeJson(SETTINGS_PATH, next);
    res.status(400).json({ success: false, msg: error.message || 'Telegram is not connected.', settings: safeSettings(next) });
  }
});

app.post('/api/settings/assistant', async (req, res) => {
  const current = await getSettings();
  const next = {
    ...current,
    assistantApiKey: req.body.assistantApiKey || current.assistantApiKey,
    assistantModel: req.body.assistantModel || current.assistantModel
  };
  await writeJson(SETTINGS_PATH, next);
  res.json({ success: true, settings: safeSettings(next) });
});

app.post('/api/assistant/chat', async (req, res) => {
  const settings = await getSettings();
  if (!settings.assistantApiKey) {
    return res.status(400).json({ success: false, msg: 'Add an assistant API key in Settings first.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.assistantApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.assistantModel,
        messages: [
          { role: 'system', content: 'You are a clear, friendly study assistant. Use simple English.' },
          { role: 'user', content: req.body.message || '' }
        ]
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Assistant request failed.');
    res.json({ success: true, reply: result.choices?.[0]?.message?.content || 'No reply.' });
  } catch (error) {
    res.status(400).json({ success: false, msg: error.message });
  }
});

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.get('*', (req, res) => {
  res.redirect('/login.html');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
