import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const app = express();

// ─── CORS — allow all origins (required for Railway) ─────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, 'data');

const SECRET_KEY = 'mychurchsecretkey2024';

// ─── Health check (lets Railway know the server is alive) ────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Church API is running' });
});

// ─── Init data directory & default files ─────────────────────────────────────
async function initializeDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const adminsFile  = join(DATA_DIR, 'admins.json');
  const sermonsFile = join(DATA_DIR, 'sermons.json');
  const eventsFile  = join(DATA_DIR, 'events.json');

  // Create default admin only if file doesn't exist
  try {
    await fs.access(adminsFile);
  } catch {
    const defaultAdmin = [{
      id: 1,
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
    }];
    await fs.writeFile(adminsFile, JSON.stringify(defaultAdmin, null, 2));
    console.log('Created default admins.json  (username: admin  password: admin123)');
  }

  for (const file of [sermonsFile, eventsFile]) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, JSON.stringify([], null, 2));
      console.log(`Created ${file}`);
    }
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admins = JSON.parse(await fs.readFile(join(DATA_DIR, 'admins.json')));
    const admin  = admins.find(a => a.username === username);

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: admin.id }, SECRET_KEY, { expiresIn: '30m' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, SECRET_KEY);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Sermons ──────────────────────────────────────────────────────────────────
app.get('/api/sermons', async (req, res) => {
  try {
    const sermons = JSON.parse(await fs.readFile(join(DATA_DIR, 'sermons.json')));
    res.json(sermons.sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) {
    console.error('Get sermons error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/sermons', authenticate, async (req, res) => {
  try {
    const sermons = JSON.parse(await fs.readFile(join(DATA_DIR, 'sermons.json')));

    const newSermon = {
      id: Date.now(),
      ...req.body,
      date: new Date(req.body.date).toISOString().split('T')[0],
    };

    // YouTube link is optional — only validate if provided
    if (newSermon.youtube_link &&
        !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(newSermon.youtube_link)) {
      return res.status(400).json({ error: 'Invalid YouTube link' });
    }

    sermons.push(newSermon);
    await fs.writeFile(join(DATA_DIR, 'sermons.json'), JSON.stringify(sermons, null, 2));
    res.json(newSermon);
  } catch (err) {
    console.error('Post sermon error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE sermon
app.delete('/api/sermons/:id', authenticate, async (req, res) => {
  try {
    let sermons = JSON.parse(await fs.readFile(join(DATA_DIR, 'sermons.json')));
    sermons = sermons.filter(s => String(s.id) !== String(req.params.id));
    await fs.writeFile(join(DATA_DIR, 'sermons.json'), JSON.stringify(sermons, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Events ───────────────────────────────────────────────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const events = JSON.parse(await fs.readFile(join(DATA_DIR, 'events.json')));
    res.json(events.sort((a, b) => new Date(b.date) - new Date(a.date)));
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/events', authenticate, async (req, res) => {
  try {
    const events = JSON.parse(await fs.readFile(join(DATA_DIR, 'events.json')));

    const newEvent = {
      id: Date.now(),
      ...req.body,
      date: new Date(req.body.date).toISOString().split('T')[0],
    };

    // Image link is optional — only validate if provided
    if (newEvent.image_link &&
        !/^(https?:\/\/).+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(newEvent.image_link)) {
      return res.status(400).json({ error: 'Invalid image link — must end in jpg/jpeg/png/gif/webp' });
    }

    events.push(newEvent);
    await fs.writeFile(join(DATA_DIR, 'events.json'), JSON.stringify(events, null, 2));
    res.json(newEvent);
  } catch (err) {
    console.error('Post event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE event
app.delete('/api/events/:id', authenticate, async (req, res) => {
  try {
    let events = JSON.parse(await fs.readFile(join(DATA_DIR, 'events.json')));
    events = events.filter(e => String(e.id) !== String(req.params.id));
    await fs.writeFile(join(DATA_DIR, 'events.json'), JSON.stringify(events, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function startServer() {
  try {
    await initializeDataDir();
    // Railway injects process.env.PORT — never hardcode a port
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
