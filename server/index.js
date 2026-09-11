import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bhoonidhiRouter from './routes/bhoonidhi.js';
import authRouter from './routes/auth.js';
import earthEngineRouter from './routes/earthEngine.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '0.0.0.0'; // explicit — must bind to all interfaces, not just
                          // localhost, to be reachable when deployed.

// CORS: if FRONTEND_ORIGIN or FRONTEND_URL is set (comma-separated list for multiple
// origins), only those origins are allowed — the right setup for a real
// deployment. If unset, all origins are allowed.
const rawOrigin = process.env.FRONTEND_ORIGIN || process.env.FRONTEND_URL;
const allowedOrigins = rawOrigin
  ? rawOrigin.split(',').map(o => o.trim()).filter(Boolean)
  : null;

app.use(cors(allowedOrigins ? {
  origin: (origin, callback) => {
    // requests with no Origin header (curl, server-to-server, health
    // checks) are always allowed through
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
} : {}));
app.use(express.json());

// Whether Earth Engine credentials are present via either supported method.
function isEeConfigured() {
  return Boolean(process.env.EE_SERVICE_ACCOUNT_KEY_PATH || process.env.EE_SERVICE_ACCOUNT_KEY_JSON);
}

// Simple status endpoint the frontend can poll to know whether this backend
// is running AND whether real Bhoonidhi credentials / JWT auth / Earth
// Engine are actually configured (vs. just the server being up with no
// configuration yet). Never returns the secrets themselves — booleans only.
app.get('/api/status', (req, res) => {
  res.json({
    backendRunning: true,
    bhoonidhiConfigured: Boolean(process.env.BHOONIDHI_USER && process.env.BHOONIDHI_PASS),
    authConfigured: Boolean(process.env.JWT_SECRET),
    earthEngineConfigured: isEeConfigured(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/satellite', bhoonidhiRouter);
app.use('/api/earth-engine', earthEngineRouter);

app.listen(PORT, HOST, () => {
  console.log(`JalDrishti backend running on http://${HOST}:${PORT}`);
  console.log(
    allowedOrigins
      ? `CORS restricted to: ${allowedOrigins.join(', ')}`
      : 'CORS: no FRONTEND_ORIGIN set — allowing all origins (fine for a prototype, not for production hardening).'
  );
  console.log(
    process.env.BHOONIDHI_USER
      ? 'Bhoonidhi credentials detected — satellite proxy routes are live.'
      : 'No Bhoonidhi credentials in .env — satellite proxy routes will return a clear "not configured" response.'
  );
  console.log(
    process.env.JWT_SECRET
      ? 'JWT_SECRET set — real authentication is active.'
      : 'No JWT_SECRET in .env — /api/auth/login will return a clear "not configured" response.'
  );
  console.log(
    isEeConfigured()
      ? `Earth Engine credentials detected (${process.env.EE_SERVICE_ACCOUNT_KEY_JSON ? 'EE_SERVICE_ACCOUNT_KEY_JSON' : 'EE_SERVICE_ACCOUNT_KEY_PATH'}) — live LULC computation is available.`
      : 'No Earth Engine credentials in .env (EE_SERVICE_ACCOUNT_KEY_PATH or EE_SERVICE_ACCOUNT_KEY_JSON) — /api/earth-engine routes will return a clear "not configured" response.'
  );
});