const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Blob } = require('node:buffer');
const { Readable } = require('node:stream');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://samiulislamarafat34:YOUR_PASSWORD@amanat-storage.yjwhqvm.mongodb.net/?appName=amanat-storage';
const client = new MongoClient(mongoUri);

let db;
async function connectDB() {
  try {
    await client.connect();
    db = client.db('amanat-storage');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}
connectDB();

// Sessions & Active Devices (using in-memory for Vercel)
const activeSessions = {};

app.set('trust proxy', true);
app.use(session({
  secret: process.env.SESSION_SECRET || 'premium-glass-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static('public', { index: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: 'temp/' });

// Helper to parse basic User-Agent
function parseUA(uaString) {
  if (!uaString) return "Unknown Device";
  if (uaString.includes('Windows')) return "Windows PC";
  if (uaString.includes('Macintosh')) return "Mac";
  if (uaString.includes('Linux')) return "Linux PC";
  if (uaString.includes('Android')) return "Android Device";
  if (uaString.includes('iPhone')) return "iPhone";
  if (uaString.includes('iPad')) return "iPad";
  return "Unknown Device";
}

// -------------------- Data Handlers (MongoDB) --------------------
async function getUsers() {
  if (!db) await connectDB();
  const users = await db.collection('users').findOne({ _id: 'allUsers' });
  return users ? users.data : {};
}
async function saveUsers(users) {
  if (!db) await connectDB();
  await db.collection('users').updateOne(
    { _id: 'allUsers' },
    { $set: { data: users } },
    { upsert: true }
  );
}
async function loadFiles() {
  if (!db) await connectDB();
  const files = await db.collection('files').findOne({ _id: 'allFiles' });
  return files ? files.data : [];
}
async function saveFiles(files) {
  if (!db) await connectDB();
  await db.collection('files').updateOne(
    { _id: 'allFiles' },
    { $set: { data: files } },
    { upsert: true }
  );
}
function isAuthenticated(req) {
  return req.session && req.session.user;
}
function authGuard(req, res, next) {
  if (isAuthenticated(req)) {
    // Update last active
    if (req.session.id && activeSessions[req.session.id]) {
       activeSessions[req.session.id].lastActive = Date.now();
    }
    return next();
  }
  return res.status(401).json({ success: false, msg: 'Unauthorized' });
}

// -------------------- Auth Routes --------------------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await getUsers();
  const user = users[username];

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ success: false, msg: 'Invalid credentials' });
  }

  // Check if account is suspended
  if (user.status === 'suspended') {
    return res.status(403).json({ success: false, msg: 'Account suspended. Contact admin.' });
  }

  req.session.user = { username };

  // Track device
  activeSessions[req.session.id] = {
    username: username,
    ip: req.ip || req.connection.remoteAddress,
    device: parseUA(req.headers['user-agent']),
    loginTime: Date.now(),
    lastActive: Date.now()
  };

  // Return user info
  res.json({
    success: true,
    user: {
      username: username,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      telegramChatId: user.telegramChatId,
      storageLimit: user.storageLimit,
      status: user.status,
      createdAt: user.createdAt
    }
  });
});

app.post('/register', async (req, res) => {
  const { name, email, mobile, username, password, telegramChatId } = req.body;

  if (!name || !email || !mobile || !username || !password) {
    return res.status(400).json({ success: false, msg: 'All fields are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, msg: 'Password must be at least 6 characters' });
  }

  const users = await getUsers();

  if (users[username]) {
    return res.status(400).json({ success: false, msg: 'Username already exists' });
  }

  // Create new user
  users[username] = {
    passwordHash: bcrypt.hashSync(password, 10),
    name: name,
    email: email,
    mobile: mobile,
    telegramChatId: telegramChatId || null,
    storageLimit: 10 * 1024 * 1024 * 1024, // 10GB default
    createdAt: Date.now(),
    status: 'active'
  };

  await saveUsers(users);

  // Save to profile in MongoDB
  await db.collection('profiles').updateOne(
    { _id: username },
    { $set: { name, email, mobile, telegramChatId: telegramChatId || null, createdAt: Date.now() } },
    { upsert: true }
  );

  // Send welcome message to user's Telegram if provided
  if (telegramChatId && process.env.TELEGRAM_BOT_TOKEN) {
    fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: `🎉 *Welcome to Amanat!*\n\nYour account has been created successfully.\n\n📁 Your files will be stored securely here.\n💾 Storage Limit: 10 GB\n\n_Built by Samiul Islam Arafat_`,
        parse_mode: 'Markdown'
      })
    }).catch(console.log);
  }

  res.json({ success: true, msg: 'Account created successfully' });
});

app.get('/logout', (req, res) => {
  delete activeSessions[req.session.id];
  req.session.destroy(() => {
    res.redirect('/login.html');
  });
});

app.get('/active-devices', authGuard, (req, res) => {
  const devices = Object.values(activeSessions).filter(s => s.username === req.session.user.username);
  res.json({ success: true, devices });
});

// -------------------- Admin User Management --------------------
app.get('/admin/users', authGuard, async (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Admin only' });
  }
  const users = await getUsers();
  const userList = Object.keys(users).map(u => ({
    username: u,
    name: users[u].name,
    email: users[u].email,
    mobile: users[u].mobile,
    telegramChatId: users[u].telegramChatId,
    storageLimit: users[u].storageLimit,
    status: users[u].status,
    createdAt: users[u].createdAt
  }));
  res.json({ success: true, users: userList });
});

app.post('/admin/user/suspend', authGuard, async (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Admin only' });
  }
  const { username, status } = req.body;
  const users = await getUsers();
  if (!users[username]) {
    return res.status(404).json({ success: false, msg: 'User not found' });
  }
  users[username].status = status;
  await saveUsers(users);
  res.json({ success: true, msg: `User ${status === 'suspended' ? 'suspended' : 'activated'}` });
});

app.post('/admin/user/delete', authGuard, async (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Admin only' });
  }
  const { username } = req.body;
  if (username === 'admin') {
    return res.status(400).json({ success: false, msg: 'Cannot delete admin' });
  }
  const users = await getUsers();
  if (!users[username]) {
    return res.status(404).json({ success: false, msg: 'User not found' });
  }
  delete users[username];
  await saveUsers(users);

  // Also delete from profile
  await db.collection('profiles').deleteOne({ _id: username });

  res.json({ success: true, msg: 'User deleted' });
});

// -------------------- Forgot Password (OTP via Telegram) --------------------
let currentOtp = null;
let otpExpires = 0;

app.post('/forgot-password', async (req, res) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  currentOtp = code;
  otpExpires = Date.now() + 10 * 60000; // 10 mins

  try {
    const tgUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const tgResp = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `🔐 *Password Reset Request*\n\nYour OTP is: \`${code}\`\n\nThis code expires in 10 minutes.`,
        parse_mode: 'Markdown'
      })
    });
    
    if (tgResp.ok) {
      res.json({ success: true });
    } else {
      res.status(500).json({ success: false, msg: 'Failed to send OTP to Telegram' });
    }
  } catch (error) {
    console.error('Telegram error:', error);
    res.status(500).json({ success: false, msg: 'Error connecting to Telegram' });
  }
});

app.post('/verify-otp', (req, res) => {
  const { code } = req.body;
  if (!currentOtp || currentOtp !== code || otpExpires < Date.now()) {
    return res.status(400).json({ success: false, msg: 'Invalid or expired OTP' });
  }
  res.json({ success: true });
});

app.post('/reset-password', async (req, res) => {
  const { code, newPassword } = req.body;
  if (!currentOtp || currentOtp !== code || otpExpires < Date.now()) {
    return res.status(400).json({ success: false, msg: 'Invalid or expired OTP' });
  }

  const users = await getUsers();
  if (users['admin']) {
    users['admin'].passwordHash = bcrypt.hashSync(newPassword, 10);
    await saveUsers(users);
  }
  currentOtp = null;
  res.json({ success: true });
});

// -------------------- Universal File Upload --------------------
function detectFileType(mimetype, filename) {
  if (mimetype.startsWith('image/')) return 'photo';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('text/') || filename.endsWith('.txt')) return 'document';
  return 'document';
}

app.post('/upload', authGuard, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, msg: 'No file provided' });

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    // Get user's Telegram Chat ID
    const users = await getUsers();
    const user = users[req.session.user.username];
    const userChatId = user?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    const tgUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`;
    const form = new FormData();
    form.append('chat_id', userChatId);

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });
    form.append('document', blob, originalName);

    const tgResp = await fetch(tgUrl, { method: 'POST', body: form });
    const tgData = await tgResp.json();

    fs.unlinkSync(filePath);

    if (!tgData.ok) {
      return res.status(500).json({ success: false, msg: 'Telegram upload failed' });
    }

    const fileType = req.file.mimetype.split('/')[0];
    let cat = 'docs';
    if (fileType === 'image') cat = 'photo';
    else if (fileType === 'video') cat = 'video';
    else if (fileType === 'audio') cat = 'audio';
    else if (req.file.mimetype.includes('text') || originalName.endsWith('.txt')) cat = 'text';

    const meta = {
      id: Date.now().toString(),
      name: originalName,
      type: cat,
      telegramFileId: tgData.result.document.file_id,
      size: req.file.size,
      folderId: req.body.folderId || null,
      uploadedAt: Date.now(),
      username: req.session.user.username
    };

    const files = await loadFiles();
    files.push(meta);
    await saveFiles(files);

    res.json({ success: true, file: meta });
  } catch (error) {
    if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ success: false, msg: 'Upload error' });
  }
});

// -------------------- Text Notes (Notepad) --------------------
app.post('/save-note', authGuard, async (req, res) => {
  const { title, content } = req.body;
  if (!content) return res.status(400).json({ success: false });

  const originalName = `${title || 'note'}_${Date.now()}.txt`;
  const tmpPath = path.join('temp', originalName);
  fs.writeFileSync(tmpPath, content);

  try {
    // Get user's Telegram Chat ID
    const users = await getUsers();
    const user = users[req.session.user.username];
    const userChatId = user?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    const tgUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`;
    const form = new FormData();
    form.append('chat_id', userChatId);

    const fileBuffer = fs.readFileSync(tmpPath);
    const blob = new Blob([fileBuffer], { type: 'text/plain' });
    form.append('document', blob, originalName);

    const tgResp = await fetch(tgUrl, { method: 'POST', body: form });
    const tgData = await tgResp.json();
    fs.unlinkSync(tmpPath);

    if (!tgData.ok) return res.status(500).json({ success: false });

    const meta = {
      id: Date.now().toString(),
      name: originalName,
      type: 'text',
      telegramFileId: tgData.result.document.file_id,
      size: content.length,
      uploadedAt: Date.now()
    };

    const files = await loadFiles();
    files.push(meta);
    await saveFiles(files);

    res.json({ success: true, file: meta });
  } catch (err) {
    if(fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    res.status(500).json({ success: false });
  }
});

// -------------------- Files & Download --------------------
app.get('/files', authGuard, async (req, res) => {
  const allFiles = await loadFiles();

  // Filter files by username (or admin sees all)
  const isAdmin = req.session.user.username === 'admin';
  const userFiles = isAdmin ? allFiles : allFiles.filter(f => f.username === req.session.user.username);

  let totalSize = 0;
  userFiles.forEach(file => { if(file.size) totalSize += file.size; });
  res.json({ files: userFiles, storageUsed: totalSize });
});

app.get('/folders', authGuard, (req, res) => {
  const foldersPath = path.join(__dirname, 'data', 'folders.json');
  const folders = fs.existsSync(foldersPath) ? JSON.parse(fs.readFileSync(foldersPath, 'utf8')) : [];
  res.json({ folders });
});

app.post('/folders', authGuard, (req, res) => {
  const { name, type } = req.body;
  if (!name) return res.status(400).json({ success: false });
  const foldersPath = path.join(__dirname, 'data', 'folders.json');
  let folders = fs.existsSync(foldersPath) ? JSON.parse(fs.readFileSync(foldersPath, 'utf8')) : [];
  const newFolder = { id: Date.now().toString(), name, type, createdAt: Date.now() };
  folders.push(newFolder);
  fs.writeFileSync(foldersPath, JSON.stringify(folders, null, 2));
  res.json({ success: true, folder: newFolder });
});

app.post('/rename', authGuard, async (req, res) => {
  const { id, newName } = req.body;
  const files = await loadFiles();
  const file = files.find(f => f.telegramFileId === id || f.id === id);
  if (!file) return res.status(404).json({ success: false });
  file.name = newName;
  await saveFiles(files);
  res.json({ success: true });
});

app.get('/download/:id', authGuard, async (req, res) => {
  try {
    const fileId = req.params.id;
    const isInline = req.query.inline === 'true';
    const files = await loadFiles();
    const fileMeta = files.find(f => f.telegramFileId === fileId);
    const fileName = fileMeta ? fileMeta.name : 'downloaded_file';

    const getUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const getResp = await fetch(getUrl);
    const getRespData = await getResp.json();
    
    if (!getRespData.ok) return res.status(404).send('File not found');
    
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${getRespData.result.file_path}`;
    
    // Support HTTP Range Requests for Video seeking
    const fetchOptions = { headers: {} };
    if (req.headers.range) {
      fetchOptions.headers['Range'] = req.headers.range;
    }
    
    const tgResp = await fetch(fileUrl, fetchOptions);
    
    // Forward headers
    res.status(tgResp.status);
    const contentType = tgResp.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    
    const contentLength = tgResp.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    
    const contentRange = tgResp.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);
    
    res.setHeader('Accept-Ranges', 'bytes');
    
    if (isInline) {
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    } else {
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    }
    
    if (tgResp.body) {
      Readable.fromWeb(tgResp.body).pipe(res);
    } else {
      res.status(500).send('Error reading stream');
    }
  } catch (err) {
    res.status(500).send('Internal Error');
  }
});

// -------------------- Profile & Profile Picture --------------------
app.get('/profile', authGuard, async (req, res) => {
  if (!db) await connectDB();
  const profile = await db.collection('profiles').findOne({ _id: req.session.user.username });
  res.json(profile || {});
});

app.post('/profile', authGuard, upload.single('profilePic'), async (req, res) => {
  const username = req.session.user.username;
  let profile = await db.collection('profiles').findOne({ _id: username }) || {};

  // Update data
  if(req.body.profileData) {
    const newData = JSON.parse(req.body.profileData);
    profile = { ...profile, ...newData };
  }

  // Handle profile pic locally for Vercel (use base64 or external)
  if(req.file) {
    const ext = path.extname(req.file.originalname);
    const picName = `profile_${Date.now()}${ext}`;
    const targetPath = path.join(__dirname, 'public', 'uploads', picName);

    if (!fs.existsSync(path.join(__dirname, 'public', 'uploads'))) {
      fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
    }

    fs.renameSync(req.file.path, targetPath);
    profile.profilePicUrl = `/uploads/${picName}`;
  }

  profile._id = username;
  await db.collection('profiles').replaceOne({ _id: username }, profile, { upsert: true });
  res.json({ success: true, profile });
});

// -------------------- User Settings (Telegram) --------------------
app.post('/settings/telegram', authGuard, async (req, res) => {
  const { telegramChatId, telegramBotToken } = req.body;
  const username = req.session.user.username;

  const users = await getUsers();
  if (!users[username]) {
    return res.status(404).json({ success: false, msg: 'User not found' });
  }

  users[username].telegramChatId = telegramChatId || null;
  await saveUsers(users);

  await db.collection('profiles').updateOne(
    { _id: username },
    { $set: { telegramChatId } },
    { upsert: true }
  );

  res.json({ success: true, msg: 'Telegram settings updated' });
});

// -------------------- Admin Panel Files (All users) --------------------
app.get('/admin/files', authGuard, async (req, res) => {
  if (req.session.user.username !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Admin only' });
  }
  const allFiles = await loadFiles();
  res.json({ success: true, files: allFiles });
});

// Default routes - serve landing page
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/index', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Session user info API
app.get('/user-info', authGuard, async (req, res) => {
  const users = await getUsers();
  const user = users[req.session.user.username];
  res.json({
    username: req.session.user.username,
    name: user?.name || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    telegramChatId: user?.telegramChatId || null,
    storageLimit: user?.storageLimit || (10 * 1024 * 1024 * 1024),
    status: user?.status || 'active',
    isAdmin: req.session.user.username === 'admin'
  });
});

// Get user's own files only
app.get('/my-files', authGuard, async (req, res) => {
  const allFiles = await loadFiles();
  res.json({ files: allFiles });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
