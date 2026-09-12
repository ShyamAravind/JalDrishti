import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'fieldEvidence.json');

// Prototype persistence: a JSON file on disk, same pattern as
// server/data/users.json. NOTE — Render's free tier has an ephemeral
// filesystem: this file (and everything written to it) is wiped on every
// redeploy or restart. This is real persistence within a single running
// instance, not permanent storage. No photo bytes are stored here at
// all — only submission metadata (GPS, trust score, observation, etc.)
// by explicit design decision, since no real file/object storage exists.

function loadSubmissions() {
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveSubmissions(submissions) {
  writeFileSync(DATA_FILE, JSON.stringify(submissions, null, 2), 'utf-8');
}

// POST /api/field-evidence — save a new field evidence submission.
router.post('/', (req, res) => {
  const {
    officerId, officerName, district,
    projectId, projectName, inspectionType, observation,
    lat, lng, capturedDate, capturedTime,
    trustScore, confidenceLevel, checks,
  } = req.body;

  if (!officerId || !projectId || !observation || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({
      error: 'invalid_submission',
      message: 'officerId, projectId, observation, lat, and lng are required.',
    });
  }

  const submission = {
    id: randomUUID(),
    officerId, officerName, district,
    projectId, projectName, inspectionType, observation,
    lat, lng, capturedDate, capturedTime,
    trustScore: typeof trustScore === 'number' ? trustScore : null,
    confidenceLevel: confidenceLevel || null,
    checks: Array.isArray(checks) ? checks : [],
    status: 'Pending',
    submittedAt: new Date().toISOString(),
  };

  const submissions = loadSubmissions();
  submissions.push(submission);
  saveSubmissions(submissions);

  res.status(201).json(submission);
});

// GET /api/field-evidence — list submissions, optionally filtered by
// officerId (for "My Submissions") or district (for the District
// Officer's inbox, built in a later phase).
router.get('/', (req, res) => {
  const { officerId, district } = req.query;
  let submissions = loadSubmissions();

  if (officerId) submissions = submissions.filter(s => s.officerId === officerId);
  if (district) submissions = submissions.filter(s => s.district === district);

  // Most recent first.
  submissions.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  res.json(submissions);
});

export default router;