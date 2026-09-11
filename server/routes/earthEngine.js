import express from 'express';
import { GoogleEarthEngineProvider, WATERSHED_BOUNDS } from '../provider/earthEngineProvider.js';
import { SrishtiDrishtiProvider } from '../provider/srishtiDrishtiProvider.js';

const router = express.Router();

const geeProvider = new GoogleEarthEngineProvider();
const srishtiProvider = new SrishtiDrishtiProvider();

const VALID_RADII_M = [250, 500, 1000];

// ── GET /api/earth-engine/status ─────────────────────────────────────────────
// Returns status of active Earth Engine provider and SRISHTI adapter readiness
router.get('/status', async (req, res) => {
  try {
    const [geeStatus, srishtiStatus] = await Promise.all([
      geeProvider.getStatus(),
      srishtiProvider.getStatus(),
    ]);

    res.json({
      activeProvider: geeProvider.name,
      providers: {
        earthEngine: geeStatus,
        srishtiDrishti: srishtiStatus,
      },
      configuredWatersheds: Object.keys(WATERSHED_BOUNDS).map(id => ({
        id,
        name: WATERSHED_BOUNDS[id].name,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'status_check_failed', message: err.message });
  }
});

// ── GET /api/earth-engine/lulc/:watershedId ──────────────────────────────────
router.get('/lulc/:watershedId', async (req, res) => {
  if (!geeProvider.isConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not set — configure EE_SERVICE_ACCOUNT_KEY_PATH or EE_SERVICE_ACCOUNT_KEY_JSON.',
    });
  }

  const { watershedId } = req.params;
  const year = req.query.year || new Date().getFullYear().toString();

  if (!WATERSHED_BOUNDS[watershedId]) {
    return res.status(400).json({
      error: 'invalid_watershed',
      message: `Unknown watershed ID "${watershedId}". Valid IDs: ${Object.keys(WATERSHED_BOUNDS).join(', ')}`,
    });
  }

  if (!/^\d{4}$/.test(year) || Number(year) < 2013 || Number(year) > new Date().getFullYear()) {
    return res.status(400).json({
      error: 'invalid_year',
      message: `Year must be a 4-digit number between 2013 and ${new Date().getFullYear()}.`,
    });
  }

  try {
    const result = await geeProvider.computeLulc(watershedId, year);
    res.json(result);
  } catch (err) {
    if (err.message === 'not_configured') {
      return res.status(503).json({
        error: 'not_configured',
        message: 'Earth Engine credentials are not configured.',
      });
    }
    console.error('[Earth Engine] LULC Error:', err.message);
    res.status(500).json({ error: 'computation_failed', message: err.message });
  }
});

// ── GET /api/earth-engine/soil-moisture/:watershedId ──────────────────────────
// Genuine Sentinel-1 SAR Surface Soil Moisture Index (SSMI)
router.get('/soil-moisture/:watershedId', async (req, res) => {
  if (!geeProvider.isConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not configured.',
    });
  }

  const { watershedId } = req.params;
  if (!WATERSHED_BOUNDS[watershedId]) {
    return res.status(400).json({
      error: 'invalid_watershed',
      message: `Unknown watershed ID "${watershedId}".`,
    });
  }

  const beforeStart = req.query.beforeStart || '2023-01-01';
  const beforeEnd = req.query.beforeEnd || '2023-06-30';
  const afterStart = req.query.afterStart || '2024-01-01';
  const afterEnd = req.query.afterEnd || '2024-06-30';

  try {
    const result = await geeProvider.computeSoilMoisture(watershedId, {
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
    });
    res.json(result);
  } catch (err) {
    console.error('[Earth Engine] Soil Moisture Error:', err.message);
    res.status(500).json({ error: 'soil_moisture_failed', message: err.message });
  }
});

// ── GET /api/earth-engine/change-detection/:watershedId ───────────────────────
router.get('/change-detection/:watershedId', async (req, res) => {
  if (!geeProvider.isConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not configured.',
    });
  }

  const { watershedId } = req.params;
  if (!WATERSHED_BOUNDS[watershedId]) {
    return res.status(400).json({
      error: 'invalid_watershed',
      message: `Unknown watershed ID "${watershedId}".`,
    });
  }

  const beforeYear = Number(req.query.beforeYear || 2020);
  const afterYear = Number(req.query.afterYear || 2024);

  try {
    const result = await geeProvider.computeTemporalChange(watershedId, beforeYear, afterYear);
    res.json(result);
  } catch (err) {
    console.error('[Earth Engine] Change Detection Error:', err.message);
    res.status(500).json({ error: 'change_detection_failed', message: err.message });
  }
});

// ── GET /api/earth-engine/land-degradation/:watershedId ───────────────────────
router.get('/land-degradation/:watershedId', async (req, res) => {
  if (!geeProvider.isConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not configured.',
    });
  }

  const { watershedId } = req.params;
  if (!WATERSHED_BOUNDS[watershedId]) {
    return res.status(400).json({
      error: 'invalid_watershed',
      message: `Unknown watershed ID "${watershedId}".`,
    });
  }

  const year = Number(req.query.year || new Date().getFullYear());

  try {
    const result = await geeProvider.computeLandDegradation(watershedId, year);
    res.json(result);
  } catch (err) {
    console.error('[Earth Engine] Land Degradation Error:', err.message);
    res.status(500).json({ error: 'land_degradation_failed', message: err.message });
  }
});

// ── GET /api/earth-engine/point-analysis ──────────────────────────────────────
router.get('/point-analysis', async (req, res) => {
  if (!geeProvider.isConfigured()) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Earth Engine credentials are not configured.',
    });
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 500);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'invalid_coordinates', message: 'lat/lng must be valid coordinates.' });
  }
  if (!VALID_RADII_M.includes(radius)) {
    return res.status(400).json({ error: 'invalid_radius', message: `radius must be one of: ${VALID_RADII_M.join(', ')}` });
  }

  try {
    const result = await geeProvider.computePointAnalysis(lat, lng, radius);
    res.json(result);
  } catch (err) {
    console.error('[Earth Engine] Point Analysis Error:', err.message);
    res.status(500).json({ error: 'computation_failed', message: err.message });
  }
});

export default router;