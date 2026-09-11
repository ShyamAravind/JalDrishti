import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// Real authentication — actual bcrypt password verification and signed JWTs,
// not the frontend-only demo simulation this replaces when the backend is
// running. User store is a local JSON file with bcrypt-hashed passwords
// (see data/users.json) — a real database in production, but the hashing
// and token-signing here are genuine, not simulated.
// ═══════════════════════════════════════════════════════════════════════════

// NOTE: JWT_SECRET is read lazily inside each handler, not as a top-level
// const — ES module imports (including this file) are resolved and
// evaluated BEFORE index.js's dotenv.config() call runs, so a top-level
// `const JWT_SECRET = process.env.JWT_SECRET` would always capture
// `undefined` regardless of what's actually in .env. Reading it inside each
// request handler means it's evaluated after dotenv has already loaded.
const TOKEN_EXPIRY = '8h';

function loadUsers() {
  const raw = readFileSync(join(__dirname, '../data/users.json'), 'utf-8');
  return JSON.parse(raw);
}

router.post('/login', async (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'JWT_SECRET is not set in server/.env — see server/.env.example.',
    });
  }

  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials', message: 'Username and password are required.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid username or password.' });
  }

  const token = jwt.sign({ officerId: user.officerId, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
  res.json({ token, officerId: user.officerId });
});

// Middleware other routes can use to require a valid token.
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing Authorization header.' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    req.officer = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired.' });
  }
}

router.get('/me', requireAuth, (req, res) => {
  res.json({ officerId: req.officer.officerId, username: req.officer.username });
});

export default router;
