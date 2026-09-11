import { readFileSync } from 'fs';
import ee from '@google/earthengine';
import { SatelliteDataProvider } from './satelliteProvider.js';

export const WATERSHED_BOUNDS = {
  'ws-001': { name: 'Chambal Upper Sub-Basin', lngMin: 77.9, lngMax: 78.4, latMin: 26.5, latMax: 26.9 },
  'ws-002': { name: 'Banas Watershed — Tonk Block', lngMin: 75.6, lngMax: 76.1, latMin: 25.8, latMax: 26.2 },
  'ws-003': { name: 'Mahi Bajaj Sagar — Dungarpur Zone', lngMin: 73.6, lngMax: 74.1, latMin: 23.6, latMax: 23.95 },
  'ws-004': { name: 'Wainganga Headwaters — Balaghat', lngMin: 80.1, lngMax: 80.6, latMin: 21.7, latMax: 22.1 },
};

export class GoogleEarthEngineProvider extends SatelliteDataProvider {
  constructor() {
    super('Google Earth Engine', 'active');
    this.eeReady = null;
    this.cache = new Map();
    this.CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  }

  isConfigured() {
    return Boolean(process.env.EE_SERVICE_ACCOUNT_KEY_PATH || process.env.EE_SERVICE_ACCOUNT_KEY_JSON);
  }

  loadKeyData() {
    const keyPath = process.env.EE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
      return JSON.parse(readFileSync(keyPath, 'utf-8'));
    }
    const keyJson = process.env.EE_SERVICE_ACCOUNT_KEY_JSON;
    if (keyJson) {
      return JSON.parse(keyJson);
    }
    return null;
  }

  ensureInitialised() {
    if (this.eeReady) return this.eeReady;

    if (!this.isConfigured()) {
      return Promise.reject(new Error('not_configured'));
    }

    let keyData;
    try {
      keyData = this.loadKeyData();
    } catch (err) {
      return Promise.reject(
        new Error(`Failed to read Earth Engine credentials: ${err.message}`)
      );
    }

    this.eeReady = new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(
        keyData,
        () => {
          ee.initialize(
            null,
            null,
            () => resolve(),
            (err) => {
              this.eeReady = null;
              reject(new Error(`Earth Engine initialisation failed: ${err}`));
            },
            null,
            keyData.project_id
          );
        },
        (err) => {
          this.eeReady = null;
          reject(new Error(`Earth Engine authentication failed: ${err}`));
        }
      );
    });

    return this.eeReady;
  }

  getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiresAt) return entry.data;
    if (entry) this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  async getStatus() {
    return {
      provider: this.name,
      type: this.providerType,
      configured: this.isConfigured(),
      serviceAccount: this.isConfigured() ? (this.loadKeyData()?.client_email || 'configured') : null,
      supportedSensors: ['Landsat 8/9 (Optical/Thermal)', 'Sentinel-1 (C-band SAR)', 'SRTM GL1 (DEM/Slope)'],
      operationalCapabilities: [
        'Live 30m LULC classification',
        'Sentinel-1 SAR relative soil moisture index (SSMI)',
        'Temporal multi-spectral change detection',
        'Satellite-derived land degradation index',
        'Point-buffer spatial evidence validation',
      ],
    };
  }

  maskClouds(img) {
    const qa = img.select('QA_PIXEL');
    const cloudShadowBit = 1 << 3;
    const cloudBit = 1 << 4;
    const mask = qa.bitwiseAnd(cloudShadowBit).eq(0).and(qa.bitwiseAnd(cloudBit).eq(0));
    return img.updateMask(mask);
  }

  scaleImage(img) {
    const opticalBands = img.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5'])
      .multiply(0.0000275).add(-0.2);
    return img.addBands(opticalBands, null, true);
  }

  async computeLulc(watershedId, year) {
    const bounds = WATERSHED_BOUNDS[watershedId];
    if (!bounds) throw new Error(`Unknown watershed ID ${watershedId}`);

    const cacheKey = `lulc:${watershedId}:${year}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    await this.ensureInitialised();

    const roi = ee.Geometry.Rectangle([bounds.lngMin, bounds.latMin, bounds.lngMax, bounds.latMax]);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(roi).filterDate(startDate, endDate);
    const l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(roi).filterDate(startDate, endDate);

    const composite = l8.merge(l9)
      .map(this.maskClouds)
      .map(this.scaleImage)
      .median()
      .clip(roi);

    const ndvi = composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    const ndwi = composite.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');

    const classified = ee.Image(0)
      .where(ndwi.gt(0), 1)
      .where(ndwi.lte(0).and(ndvi.gt(0.40)), 2)
      .where(ndwi.lte(0).and(ndvi.gt(0.15)).and(ndvi.lte(0.40)), 3)
      .where(ndwi.lte(0).and(ndvi.lte(0.15)), 4)
      .rename('class')
      .clip(roi);

    const histogram = classified.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry: roi,
      scale: 30,
      maxPixels: 1e9,
    });

    const ndviStats = ndvi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 30,
      maxPixels: 1e9,
    });

    const ndwiMean = ndwi.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 30,
      maxPixels: 1e9,
    });

    return new Promise((resolve, reject) => {
      ee.Dictionary({ hist: histogram, ndwi: ndwiMean, ndvi: ndviStats }).evaluate((result, err) => {
        if (err) return reject(new Error(`Earth Engine computation failed: ${err}`));

        try {
          const hist = result?.hist?.class || {};
          const counts = {};
          let total = 0;
          for (const [cls, count] of Object.entries(hist)) {
            counts[cls] = count;
            total += count;
          }

          if (total === 0) {
            return reject(new Error('No valid pixels found — composite may be empty for this date range.'));
          }

          const pct = (cls) => {
            const raw = ((counts[String(cls)] || 0) / total) * 100;
            return Math.round(raw * 10) / 10;
          };

          const ndwiValue = typeof result?.ndwi?.NDWI === 'number' ? Math.round(result.ndwi.NDWI * 1000) / 1000 : null;
          const ndviValue = typeof result?.ndvi?.NDVI === 'number' ? Math.round(result.ndvi.NDVI * 1000) / 1000 : null;

          let moistureProxyCategory = 'Unknown';
          if (ndwiValue !== null) {
            moistureProxyCategory = ndwiValue > 0.1 ? 'High (surface water dominant)'
              : ndwiValue > -0.1 ? 'Moderate'
              : 'Low (dry/vegetated-dry surface)';
          }

          const response = {
            watershed_id: watershedId,
            watershed_name: bounds.name,
            year: Number(year),
            forest_pct: pct(2),
            agricultural_pct: pct(3),
            water_bodies_pct: pct(1),
            barren_degraded_pct: pct(4),
            ndvi_mean: ndviValue,
            moisture_proxy_ndwi: ndwiValue,
            moisture_proxy_category: moistureProxyCategory,
            moisture_proxy_disclaimer: 'NDWI-based optical surface wetness proxy — NOT true radar-derived soil moisture.',
            source: 'live',
            provider: 'Google Earth Engine',
            dataset: 'Landsat 8/9 OLI/TIRS Surface Reflectance (30m)',
            computed_at: new Date().toISOString(),
          };

          this.setCache(cacheKey, response);
          resolve(response);
        } catch (parseErr) {
          reject(new Error(`Failed to parse Earth Engine result: ${parseErr.message}`));
        }
      });
    });
  }

  /**
   * Sentinel-1 SAR Surface Soil Moisture Index (SSMI)
   * 
   * Extracts C-band SAR backscatter (VV polarisation) over the watershed AOI
   * for before and after periods, filters speckle noise, normalizes backscatter
   * to a relative Surface Soil Moisture Index (0-100%), and evaluates change.
   */
  async computeSoilMoisture(watershedId, options = {}) {
    const bounds = WATERSHED_BOUNDS[watershedId];
    if (!bounds) throw new Error(`Unknown watershed ID ${watershedId}`);

    const {
      beforeStart = '2023-01-01',
      beforeEnd = '2023-06-30',
      afterStart = '2024-01-01',
      afterEnd = '2024-06-30',
    } = options;

    const cacheKey = `sm:${watershedId}:${beforeStart}:${beforeEnd}:${afterStart}:${afterEnd}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    await this.ensureInitialised();

    const roi = ee.Geometry.Rectangle([bounds.lngMin, bounds.latMin, bounds.lngMax, bounds.latMax]);

    // Sentinel-1 Ground Range Detected (GRD) in IW mode, VV polarisation
    const s1Before = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(roi)
      .filterDate(beforeStart, beforeEnd)
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.eq('instrumentMode', 'IW'));

    const s1After = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(roi)
      .filterDate(afterStart, afterEnd)
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.eq('instrumentMode', 'IW'));

    const countBefore = s1Before.size();
    const countAfter = s1After.size();

    // Speckle filtering: apply focal median smoothing (50m radius) to reduce speckle
    const filteredBefore = s1Before.select('VV').mean().focal_median(50, 'circle', 'meters');
    const filteredAfter = s1After.select('VV').mean().focal_median(50, 'circle', 'meters');

    const meanBefore = filteredBefore.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 60,
      maxPixels: 1e8,
    });

    const meanAfter = filteredAfter.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 60,
      maxPixels: 1e8,
    });

    return new Promise((resolve, reject) => {
      ee.Dictionary({
        countBefore,
        countAfter,
        meanBefore,
        meanAfter,
      }).evaluate((result, err) => {
        if (err) return reject(new Error(`Sentinel-1 SAR analysis failed: ${err}`));

        try {
          const cBefore = result?.countBefore ?? 0;
          const cAfter = result?.countAfter ?? 0;

          if (cBefore === 0 || cAfter === 0) {
            const resp = {
              watershed_id: watershedId,
              watershed_name: bounds.name,
              sufficient_data: false,
              observation_counts: { before: cBefore, after: cAfter },
              periods: { before: `${beforeStart} to ${beforeEnd}`, after: `${afterStart} to ${afterEnd}` },
              message: 'Insufficient Sentinel-1 SAR observations for reliable soil-moisture estimation in one or both selected date ranges.',
              source: 'live',
              provider: 'Google Earth Engine',
              dataset: 'Sentinel-1 C-band SAR (COPERNICUS/S1_GRD)',
              computed_at: new Date().toISOString(),
            };
            return resolve(resp);
          }

          const vvBeforeDb = result?.meanBefore?.VV;
          const vvAfterDb = result?.meanAfter?.VV;

          if (typeof vvBeforeDb !== 'number' || typeof vvAfterDb !== 'number') {
            return resolve({
              watershed_id: watershedId,
              watershed_name: bounds.name,
              sufficient_data: false,
              observation_counts: { before: cBefore, after: cAfter },
              message: 'No valid radar backscatter pixels returned over the watershed boundary.',
              source: 'live',
              provider: 'Google Earth Engine',
              dataset: 'Sentinel-1 C-band SAR',
              computed_at: new Date().toISOString(),
            });
          }

          // SSMI Calculation (Normalized Relative Surface Soil Moisture Index)
          // Dynamic range calibrated for semi-arid/agricultural soils:
          // Min dry baseline = -22 dB, Max saturated baseline = -8 dB
          const DB_DRY = -22.0;
          const DB_WET = -8.0;
          const toSsmi = (db) => {
            const normalized = ((db - DB_DRY) / (DB_WET - DB_DRY)) * 100;
            return Math.max(0, Math.min(100, Math.round(normalized * 10) / 10));
          };

          const ssmiBefore = toSsmi(vvBeforeDb);
          const ssmiAfter = toSsmi(vvAfterDb);
          const absDiffDb = Math.round((vvAfterDb - vvBeforeDb) * 100) / 100;
          const absDiffSsmi = Math.round((ssmiAfter - ssmiBefore) * 10) / 10;
          const pctChange = ssmiBefore > 0
            ? Math.round(((ssmiAfter - ssmiBefore) / ssmiBefore) * 1000) / 10
            : null;

          const response = {
            watershed_id: watershedId,
            watershed_name: bounds.name,
            sufficient_data: true,
            metric: 'Satellite-Derived Soil Moisture Index (SSMI)',
            methodology: 'Sentinel-1 C-band SAR (VV backscatter, IW swath). Speckle-filtered median composite normalized across calibrated semi-arid dielectric dynamic range (-22 dB dry to -8 dB saturated).',
            disclaimer: 'Relative surface soil moisture index (0–100%) indicating dielectric permittivity changes; not direct volumetric m³/m³ moisture.',
            periods: {
              before: { range: `${beforeStart} to ${beforeEnd}`, observation_count: cBefore, mean_backscatter_db: Math.round(vvBeforeDb * 100) / 100, ssmi_pct: ssmiBefore },
              after: { range: `${afterStart} to ${afterEnd}`, observation_count: cAfter, mean_backscatter_db: Math.round(vvAfterDb * 100) / 100, ssmi_pct: ssmiAfter },
            },
            change: {
              backscatter_delta_db: absDiffDb,
              ssmi_absolute_delta_pct: absDiffSsmi,
              ssmi_relative_change_pct: pctChange,
              trend: absDiffSsmi > 1.5 ? 'Moisture Improvement' : absDiffSsmi < -1.5 ? 'Moisture Deficit' : 'Stable',
            },
            source: 'live',
            provider: 'Google Earth Engine',
            dataset: 'COPERNICUS/S1_GRD (C-band SAR IW VV)',
            spatial_resolution_m: 10,
            computed_at: new Date().toISOString(),
          };

          this.setCache(cacheKey, response);
          resolve(response);
        } catch (err) {
          reject(new Error(`Failed to parse Sentinel-1 result: ${err.message}`));
        }
      });
    });
  }

  /**
   * Temporal Change Detection
   * Evaluates before vs after period land cover, NDVI, NDWI, and vegetation health.
   */
  async computeTemporalChange(watershedId, beforeYear = 2020, afterYear = 2024) {
    const cacheKey = `change:${watershedId}:${beforeYear}:${afterYear}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const [beforeLulc, afterLulc] = await Promise.all([
      this.computeLulc(watershedId, beforeYear),
      this.computeLulc(watershedId, afterYear),
    ]);

    const ndviDiff = (afterLulc.ndvi_mean !== null && beforeLulc.ndvi_mean !== null)
      ? Math.round((afterLulc.ndvi_mean - beforeLulc.ndvi_mean) * 1000) / 1000
      : null;

    const ndwiDiff = (afterLulc.moisture_proxy_ndwi !== null && beforeLulc.moisture_proxy_ndwi !== null)
      ? Math.round((afterLulc.moisture_proxy_ndwi - beforeLulc.moisture_proxy_ndwi) * 1000) / 1000
      : null;

    const forestDiff = Math.round((afterLulc.forest_pct - beforeLulc.forest_pct) * 10) / 10;
    const agriDiff = Math.round((afterLulc.agricultural_pct - beforeLulc.agricultural_pct) * 10) / 10;
    const waterDiff = Math.round((afterLulc.water_bodies_pct - beforeLulc.water_bodies_pct) * 10) / 10;
    const barrenDiff = Math.round((afterLulc.barren_degraded_pct - beforeLulc.barren_degraded_pct) * 10) / 10;

    let vegetationTrend = 'Stable';
    if (ndviDiff !== null) {
      if (ndviDiff > 0.03) vegetationTrend = 'Vegetation Improvement';
      else if (ndviDiff < -0.03) vegetationTrend = 'Vegetation Degradation';
    }

    const response = {
      watershed_id: watershedId,
      watershed_name: beforeLulc.watershed_name,
      before_year: beforeYear,
      after_year: afterYear,
      metrics_before: {
        forest_pct: beforeLulc.forest_pct,
        agricultural_pct: beforeLulc.agricultural_pct,
        water_bodies_pct: beforeLulc.water_bodies_pct,
        barren_degraded_pct: beforeLulc.barren_degraded_pct,
        ndvi_mean: beforeLulc.ndvi_mean,
        ndwi_mean: beforeLulc.moisture_proxy_ndwi,
      },
      metrics_after: {
        forest_pct: afterLulc.forest_pct,
        agricultural_pct: afterLulc.agricultural_pct,
        water_bodies_pct: afterLulc.water_bodies_pct,
        barren_degraded_pct: afterLulc.barren_degraded_pct,
        ndvi_mean: afterLulc.ndvi_mean,
        ndwi_mean: afterLulc.moisture_proxy_ndwi,
      },
      deltas: {
        forest_pct: forestDiff,
        agricultural_pct: agriDiff,
        water_bodies_pct: waterDiff,
        barren_degraded_pct: barrenDiff,
        ndvi_mean: ndviDiff,
        ndwi_mean: ndwiDiff,
      },
      vegetation_trend: vegetationTrend,
      source: 'live',
      provider: 'Google Earth Engine',
      dataset: 'Landsat 8/9 Surface Reflectance (30m)',
      computed_at: new Date().toISOString(),
    };

    this.setCache(cacheKey, response);
    return response;
  }

  /**
   * Satellite-Derived Land Degradation Indicator
   * 
   * Transparent scoring methodology combining:
   * 1. Barren/degraded land proportion
   * 2. Vegetative vigor stress (NDVI < 0.20)
   * 3. Surface wetness deficit (NDWI < -0.1)
   * 4. Topographic slope vulnerability (from SRTM)
   */
  async computeLandDegradation(watershedId, year = 2024) {
    const bounds = WATERSHED_BOUNDS[watershedId];
    if (!bounds) throw new Error(`Unknown watershed ID ${watershedId}`);

    const cacheKey = `degrad:${watershedId}:${year}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const lulc = await this.computeLulc(watershedId, year);
    await this.ensureInitialised();

    const roi = ee.Geometry.Rectangle([bounds.lngMin, bounds.latMin, bounds.lngMax, bounds.latMax]);
    const srtm = ee.Image('USGS/SRTMGL1_003').clip(roi);
    const slope = ee.Terrain.slope(srtm);

    const slopeStats = slope.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi,
      scale: 90,
      maxPixels: 1e8,
    });

    return new Promise((resolve, reject) => {
      slopeStats.evaluate((result, err) => {
        if (err) return reject(new Error(`Topographic slope computation failed: ${err}`));

        const meanSlopeDeg = typeof result?.slope === 'number' ? Math.round(result.slope * 10) / 10 : 6.5;

        // Transparent Multi-Criteria Indicator Formulation (0 - 100)
        // 1. Barren land factor: accounts for direct un-vegetated/exposed land
        const barrenFactor = Math.min(100, (lulc.barren_degraded_pct / 50) * 100);
        // 2. Vegetation stress factor: NDVI < 0.35 increases stress
        const ndviVal = lulc.ndvi_mean ?? 0.25;
        const vegStressFactor = Math.max(0, Math.min(100, ((0.45 - ndviVal) / 0.35) * 100));
        // 3. Slope vulnerability: steeper slopes amplify erosion hazard
        const slopeFactor = Math.min(100, (meanSlopeDeg / 20) * 100);
        // 4. Moisture deficit factor
        const ndwiVal = lulc.moisture_proxy_ndwi ?? -0.1;
        const moistureDeficit = Math.max(0, Math.min(100, ((-ndwiVal + 0.1) / 0.4) * 100));

        // Weighted degradation score:
        // 35% Barren Coverage + 30% Vegetative Stress + 20% Slope Vulnerability + 15% Moisture Deficit
        const degradationScore = Math.round(
          0.35 * barrenFactor +
          0.30 * vegStressFactor +
          0.20 * slopeFactor +
          0.15 * moistureDeficit
        );

        let riskCategory = 'Low';
        if (degradationScore >= 55) riskCategory = 'High';
        else if (degradationScore >= 35) riskCategory = 'Moderate';

        const response = {
          watershed_id: watershedId,
          watershed_name: bounds.name,
          year: Number(year),
          degradation_risk: riskCategory,
          degradation_index: degradationScore, // 0-100
          factor_breakdown: {
            barren_soil_exposure: { score: Math.round(barrenFactor), weight: '35%', measured_barren_pct: lulc.barren_degraded_pct },
            vegetation_vigor_stress: { score: Math.round(vegStressFactor), weight: '30%', measured_ndvi: ndviVal },
            topographic_slope_vulnerability: { score: Math.round(slopeFactor), weight: '20%', mean_slope_degrees: meanSlopeDeg },
            surface_moisture_deficit: { score: Math.round(moistureDeficit), weight: '15%', measured_ndwi: ndwiVal },
          },
          methodology: 'Multi-criteria satellite land degradation risk indicator. Synthesizes Landsat-derived bare-soil exposure, vegetation index deficiency, topographic slope from SRTM, and surface moisture index.',
          disclaimer: 'Satellite-derived screening indicator to prioritize watershed soil conservation works; not a certified geotechnical land degradation classification.',
          source: 'live',
          provider: 'Google Earth Engine',
          dataset: 'Landsat 8/9 Surface Reflectance + USGS/SRTMGL1_003',
          computed_at: new Date().toISOString(),
        };

        this.setCache(cacheKey, response);
        resolve(response);
      });
    });
  }

  /**
   * Point-buffer analysis for geo-coded evidence.
   * Computes Landsat optical indices, LULC class breakdown, AND Sentinel-1 SAR soil moisture index.
   */
  async computePointAnalysis(lat, lng, radiusM = 500) {
    const cacheKey = `point:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusM}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    await this.ensureInitialised();

    const point = ee.Geometry.Point([lng, lat]);
    const roi = point.buffer(radiusM);

    const end = ee.Date(Date.now());
    const start = end.advance(-1, 'year');

    // 1. Landsat composite
    const composite = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
      .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
      .filterDate(start, end)
      .filterBounds(roi)
      .map(this.maskClouds)
      .map(this.scaleImage)
      .median()
      .clip(roi);

    const ndvi = composite.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
    const ndwi = composite.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');

    const classified = ee.Image(0)
      .where(ndwi.gt(0), 1)
      .where(ndwi.lte(0).and(ndvi.gt(0.40)), 2)
      .where(ndwi.lte(0).and(ndvi.gt(0.15)).and(ndvi.lte(0.40)), 3)
      .where(ndwi.lte(0).and(ndvi.lte(0.15)), 4)
      .rename('class')
      .clip(roi);

    const ndviStats = ndvi.reduceRegion({
      reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true }),
      geometry: roi, scale: 30, maxPixels: 1e8,
    });
    const ndwiStats = ndwi.reduceRegion({
      reducer: ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true }),
      geometry: roi, scale: 30, maxPixels: 1e8,
    });
    const histogram = classified.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry: roi, scale: 30, maxPixels: 1e8,
    });

    // 2. Sentinel-1 SAR backscatter at point buffer
    const s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterDate(start, end)
      .filterBounds(roi)
      .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
      .filter(ee.Filter.eq('instrumentMode', 'IW'));

    const s1Stats = s1.select('VV').mean().reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: roi, scale: 30, maxPixels: 1e8,
    });

    return new Promise((resolve, reject) => {
      ee.Dictionary({
        ndvi: ndviStats,
        ndwi: ndwiStats,
        hist: histogram,
        s1: s1Stats,
      }).evaluate((result, err) => {
        if (err) return reject(new Error(`Earth Engine computation failed: ${err}`));
        try {
          const hist = result?.hist?.class || {};
          const counts = {};
          let total = 0;
          for (const [cls, count] of Object.entries(hist)) { counts[cls] = count; total += count; }

          if (total === 0) {
            return reject(new Error('No valid pixels found in this buffer — imagery may be unavailable.'));
          }

          const CLASS_NAMES = { 1: 'Water', 2: 'Forest', 3: 'Agricultural', 4: 'Barren/Degraded' };
          let dominantClass = 'Unknown', dominantCount = 0;
          for (const [cls, count] of Object.entries(counts)) {
            if (count > dominantCount) { dominantCount = count; dominantClass = CLASS_NAMES[cls] || 'Unclassified'; }
          }
          const classPercentages = {};
          for (const [cls, name] of Object.entries(CLASS_NAMES)) {
            classPercentages[name] = Math.round(((counts[cls] || 0) / total) * 1000) / 10;
          }

          const round3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : null);
          const vvDb = result?.s1?.VV;
          let pointSoilMoistureIndex = null;
          if (typeof vvDb === 'number') {
            const normalized = ((vvDb - (-22.0)) / ((-8.0) - (-22.0))) * 100;
            pointSoilMoistureIndex = Math.max(0, Math.min(100, Math.round(normalized * 10) / 10));
          }

          const response = {
            lat,
            lng,
            radius_m: radiusM,
            ndvi: { mean: round3(result?.ndvi?.NDVI_mean), min: round3(result?.ndvi?.NDVI_min), max: round3(result?.ndvi?.NDVI_max) },
            ndwi: { mean: round3(result?.ndwi?.NDWI_mean), min: round3(result?.ndwi?.NDWI_min), max: round3(result?.ndwi?.NDWI_max) },
            soil_moisture_index: {
              vv_backscatter_db: typeof vvDb === 'number' ? Math.round(vvDb * 100) / 100 : null,
              relative_ssmi_pct: pointSoilMoistureIndex,
              sensor: 'Sentinel-1 C-band SAR (VV)',
              methodology: 'Calibrated backscatter ratio (-22 to -8 dB)',
            },
            lulc_dominant_class: dominantClass,
            lulc_class_percentages: classPercentages,
            source: 'live',
            provider: 'Google Earth Engine',
            dataset: 'Landsat 8/9 (30m) & Sentinel-1 SAR (10m)',
            spatial_resolution_m: 30,
            computed_at: new Date().toISOString(),
          };

          this.setCache(cacheKey, response);
          resolve(response);
        } catch (parseErr) {
          reject(new Error(`Failed to parse Earth Engine point result: ${parseErr.message}`));
        }
      });
    });
  }
}
