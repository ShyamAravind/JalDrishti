import express from 'express';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// Bhoonidhi (NRSC/ISRO Earth Observation Data Hub) proxy
//
// Confirmed from NRSC's own API specification (bhoonidhi.nrsc.gov.in):
//   - Auth: user_id + password -> Bearer access_token (exact login request
//     shape needs confirming against the official spec once you have a
//     registered account — that documentation is only fully visible after
//     registration, so the exact field names below are our best documented
//     guess and MUST be checked against the real docs before relying on this).
//   - Base STAC endpoints (confirmed real, from the public API spec page):
//       GET  /data/collections
//       GET  /data/collections/{collection_id}
//       GET  /data/collections/{collection_id}/items
//       GET  /data/collections/{collection_id}/items/{item_id}
//   - All requests need `Authorization: Bearer <access_token>`.
//
// This backend never sends BHOONIDHI_USER/BHOONIDHI_PASS to the frontend —
// only this server holds them, read from environment variables.
// ═══════════════════════════════════════════════════════════════════════════

const BHOONIDHI_BASE = 'https://bhoonidhi-api.nrsc.gov.in';

// TODO: confirm exact login endpoint + payload shape against the official
// Bhoonidhi API spec once registered — this is a placeholder based on the
// documented "user_id/password -> access_token" flow description.
const BHOONIDHI_LOGIN_URL = `${BHOONIDHI_BASE}/auth/login`;

let cachedToken = null;
let cachedTokenExpiry = 0;

function credentialsConfigured() {
  return Boolean(process.env.BHOONIDHI_USER && process.env.BHOONIDHI_PASS);
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const res = await fetch(BHOONIDHI_LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: process.env.BHOONIDHI_USER,
      password: process.env.BHOONIDHI_PASS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Bhoonidhi login failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Cache for 50 minutes by default if the API doesn't specify a lifetime —
  // adjust once the real token expiry is confirmed from the official docs.
  cachedTokenExpiry = Date.now() + (data.expires_in ? data.expires_in * 1000 : 50 * 60 * 1000);
  return cachedToken;
}

// Guard every route: if credentials aren't configured, respond clearly
// rather than attempting a request that will just fail confusingly.
router.use((req, res, next) => {
  if (!credentialsConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Bhoonidhi credentials are not set. Add BHOONIDHI_USER and BHOONIDHI_PASS to server/.env — see server/.env.example.',
    });
  }
  next();
});

// GET /api/satellite/collections — list available data collections
router.get('/collections', async (req, res) => {
  try {
    const token = await getAccessToken();
    const upstream = await fetch(`${BHOONIDHI_BASE}/data/collections`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

// GET /api/satellite/collections/:collectionId/items — search items in a
// collection, optionally filtered by bbox (lon_min,lat_min,lon_max,lat_max)
// and date range via query params, per the STAC spec Bhoonidhi follows.
router.get('/collections/:collectionId/items', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { collectionId } = req.params;
    const qs = new URLSearchParams(req.query).toString();
    const upstream = await fetch(
      `${BHOONIDHI_BASE}/data/collections/${collectionId}/items${qs ? `?${qs}` : ''}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: err.message });
  }
});

export default router;
