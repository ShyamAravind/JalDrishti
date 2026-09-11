import type {
  ProjectType, GisFeature, GeoJsonPoint, GeoJsonLineString,
  Project, CandidateInterventionType, RankedCandidate,
} from '../types';

/**
 * Computes a simple, heuristic "Potential Impact" score for a proposed
 * intervention point. This is NOT a real hydrological model — it is a
 * transparent, rule-based scoring function designed for the What-If
 * Simulator prototype. The logic is intentionally simple so it can be
 * explained clearly to SIH judges.
 *
 * Scoring factors (each 0–100, then weighted):
 *   1. Distance to nearest water body  (weight: 0.35) — closer = better
 *   2. Distance to nearest drainage line (weight: 0.40) — closer = better
 *   3. Land-use suitability at the point (weight: 0.25) — by category
 */

const WATER_BODY_WEIGHT = 0.35;
const DRAINAGE_WEIGHT   = 0.40;
const LAND_USE_WEIGHT   = 0.25;

/** Haversine distance in metres between two [lng, lat] coordinate pairs. */
export function haversineM(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance-decay caps, calibrated against the actual distance distribution
// observed in the real project dataset (2km-18km to nearest mock water/
// drainage feature, since those layers are intentionally sparse). The
// original 5000m/8000m caps floored nearly every real site to a flat 0,
// erasing the water/drainage signal entirely — see engineValidation.ts for
// how this was diagnosed (backtesting against real project sites).
const WATER_PROXIMITY_MAX_M = 20000;
const DRAINAGE_PROXIMITY_MAX_M = 20000;

/** Score: proximity to water body (0m = 100, ≥maxM = 0, linear). */
function proximityScore(distanceM: number, maxM = WATER_PROXIMITY_MAX_M): number {
  return Math.max(0, Math.round(((maxM - distanceM) / maxM) * 100));
}

/** Land-use suitability scores per category. */
const LAND_USE_SCORES: Record<string, number> = {
  Barren:         90,
  Agricultural:   70,
  'Sparse Vegetation': 60,
  'Dense Vegetation':  40,
  Forest:         30,
  Reservoir:      20,
};

function landUseSuitability(category: string): number {
  return LAND_USE_SCORES[category] ?? 50;
}

/** Closest point on a LineString to a query point (simplified). */
function distanceToLineString(
  query: [number, number],
  coords: [number, number][]
): number {
  let minDist = Infinity;
  for (const coord of coords) {
    const d = haversineM(query, coord);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Finds the category of the nearest polygon feature (by centroid distance)
 * among the given GIS features. Shared by both the land-use lookup (used by
 * computeWhatIfScore) and the slope lookup (used by
 * computeAllSuitabilityScores) — same centroid-proxy pattern, different
 * feature filter.
 */
/** Computes the centroid of a polygon's outer ring (ignores holes, which is
 * fine for a proximity-proxy — holes don't meaningfully shift the centroid
 * of a large outer boundary). */
function ringCentroid(ring: [number, number][]): [number, number] {
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return [lng, lat];
}

export function nearestPolygonCategory(
  query: [number, number],
  polygonFeatures: GisFeature[],
  fallback: string
): string {
  let category = fallback;
  let minDist = Infinity;
  for (const pf of polygonFeatures) {
    let centroid: [number, number] | null = null;

    if (pf.geometry.type === 'Polygon') {
      const outerRing = (pf.geometry as { type: 'Polygon'; coordinates: [number, number][][] }).coordinates[0];
      centroid = ringCentroid(outerRing);
    } else if (pf.geometry.type === 'MultiPolygon') {
      // Real Earth Engine exports (e.g. SRTM-derived slope zones) often come
      // back as MultiPolygon even for a single contiguous-looking region.
      // Use the largest constituent polygon's outer ring as the proxy.
      const polys = (pf.geometry as { type: 'MultiPolygon'; coordinates: [number, number][][][] }).coordinates;
      let largestRing: [number, number][] | null = null;
      let largestSpan = -1;
      for (const poly of polys) {
        const outerRing = poly[0];
        const lngs = outerRing.map(c => c[0]);
        const lats = outerRing.map(c => c[1]);
        const span = (Math.max(...lngs) - Math.min(...lngs)) * (Math.max(...lats) - Math.min(...lats));
        if (span > largestSpan) { largestSpan = span; largestRing = outerRing; }
      }
      if (largestRing) centroid = ringCentroid(largestRing);
    }

    if (centroid) {
      const d = haversineM(query, centroid);
      if (d < minDist) {
        minDist = d;
        category = pf.properties.category;
      }
    }
  }
  return category;
}

export interface WhatIfScore {
  distanceToWaterBody: number;  // 0–100
  distanceToDrainage: number;   // 0–100
  landUseSuitability: number;   // 0–100
  total: number;                // weighted average 0–100
  nearestWaterBodyM: number;
  nearestDrainageM: number;
  landUseCategory: string;
}

/**
 * Main scoring function.
 * @param lat - candidate latitude
 * @param lng - candidate longitude
 * @param type - intervention type (reserved for type-specific weighting later)
 * @param gisFeatures - all loaded GIS features
 */
export function computeWhatIfScore(
  lat: number,
  lng: number,
  _type: ProjectType,
  gisFeatures: GisFeature[]
): WhatIfScore {
  const query: [number, number] = [lng, lat];

  // ── 1. Distance to nearest water body ─────────────────────────────────────
  const waterBodies = gisFeatures.filter(
    f => f.properties.layer_type === 'water_bodies' || f.properties.layer_type === 'interventions'
  );
  let nearestWaterBodyM = Infinity;
  for (const wb of waterBodies) {
    if (wb.geometry.type === 'Point') {
      const d = haversineM(query, (wb.geometry as GeoJsonPoint).coordinates as [number, number]);
      if (d < nearestWaterBodyM) nearestWaterBodyM = d;
    }
  }

  // ── 2. Distance to nearest drainage line ──────────────────────────────────
  const drainageLines = gisFeatures.filter(f => f.properties.layer_type === 'drainage');
  let nearestDrainageM = Infinity;
  for (const dl of drainageLines) {
    if (dl.geometry.type === 'LineString') {
      const d = distanceToLineString(query, (dl.geometry as GeoJsonLineString).coordinates as [number, number][]);
      if (d < nearestDrainageM) nearestDrainageM = d;
    }
  }

  // ── 3. Land-use at the candidate point ────────────────────────────────────
  // Pick the nearest LULC polygon's category as a proxy (centroid-based).
  const lulcFeatures = gisFeatures.filter(f => f.properties.layer_type === 'lulc' || f.properties.layer_type === 'vegetation');
  const landUseCategory = nearestPolygonCategory(query, lulcFeatures, 'Agricultural');

  // ── Compute sub-scores ────────────────────────────────────────────────────
  const wbScore  = proximityScore(nearestWaterBodyM === Infinity ? WATER_PROXIMITY_MAX_M : nearestWaterBodyM);
  const drScore  = proximityScore(nearestDrainageM  === Infinity ? DRAINAGE_PROXIMITY_MAX_M : nearestDrainageM, DRAINAGE_PROXIMITY_MAX_M);
  const luScore  = landUseSuitability(landUseCategory);

  const total = Math.round(
    wbScore * WATER_BODY_WEIGHT +
    drScore * DRAINAGE_WEIGHT   +
    luScore * LAND_USE_WEIGHT
  );

  return {
    distanceToWaterBody: wbScore,
    distanceToDrainage:  drScore,
    landUseSuitability:  luScore,
    total,
    nearestWaterBodyM:   Math.round(nearestWaterBodyM === Infinity ? 0 : nearestWaterBodyM),
    nearestDrainageM:    Math.round(nearestDrainageM  === Infinity ? 0 : nearestDrainageM),
    landUseCategory,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Multi-type ranked suitability (What-If Simulator v2)
//
// Instead of scoring one intervention type at a time, this computes a score
// for ALL candidate intervention types at a clicked location and returns
// them ranked. Each type has its own weight profile and slope-suitability
// table, reflecting real watershed-engineering logic (e.g. Check Dams want
// to sit on/near a drainage channel with moderate slope; Contour Bunding is
// specifically for steep terrain; Farm Ponds want flatter, agricultural
// land). This is still a transparent heuristic, not a hydrological model —
// see the disclaimer shown in the Simulator UI.
//
// NOTE ON SLOPE DATA: slope categories are read from gisLayers.geojson
// features tagged layer_type: 'slope'. As of this version, that layer is
// REAL data — Flat/Gentle/Moderate/Steep zones derived from USGS/SRTMGL1_003
// (SRTM 30m DEM) via Google Earth Engine, not mock data. See the source
// note in gisLayers.geojson itself for processing details.
// ═══════════════════════════════════════════════════════════════════════════

/** A "check" (for the pass/fail checklist) passes when its sub-score meets this bar. */
export const CHECK_PASS_THRESHOLD = 60;

/** Flat point penalty applied when a same-type project already exists nearby. */
const CONFLICT_PENALTY = 15;

/** Radius within which an existing same-type project counts as a conflict. */
const CONFLICT_RADIUS_M = 300;

interface WeightProfile {
  drainage: number;
  water: number;
  landUse: number;
  slope: number;
}

/** Per-intervention-type weight profiles. Each must sum to 1.0. */
const WEIGHT_PROFILES: Record<CandidateInterventionType, WeightProfile> = {
  'Check Dam':         { drainage: 0.45, water: 0.20, landUse: 0.15, slope: 0.20 },
  'Farm Pond':         { drainage: 0.15, water: 0.20, landUse: 0.40, slope: 0.25 },
  'Percolation Tank':  { drainage: 0.30, water: 0.15, landUse: 0.30, slope: 0.25 },
  'Contour Bunding':   { drainage: 0.10, water: 0.05, landUse: 0.35, slope: 0.50 },
  'Farm Bund':         { drainage: 0.05, water: 0.05, landUse: 0.55, slope: 0.35 },
};

type SlopeCategory = 'Flat' | 'Gentle' | 'Moderate' | 'Steep';

/** Per-type slope suitability sub-scores (0-100), by slope category. */
const SLOPE_SUITABILITY: Record<CandidateInterventionType, Record<SlopeCategory, number>> = {
  'Check Dam':         { Flat: 40, Gentle: 70, Moderate: 90, Steep: 60 },
  'Farm Pond':         { Flat: 90, Gentle: 75, Moderate: 40, Steep: 10 },
  'Percolation Tank':  { Flat: 70, Gentle: 90, Moderate: 60, Steep: 20 },
  'Contour Bunding':   { Flat: 20, Gentle: 50, Moderate: 85, Steep: 95 },
  'Farm Bund':         { Flat: 60, Gentle: 85, Moderate: 70, Steep: 30 },
};

function slopeSuitability(type: CandidateInterventionType, category: string): number {
  const table = SLOPE_SUITABILITY[type];
  return table[category as SlopeCategory] ?? 50;
}

/**
 * Finds an existing project of the same candidate type within
 * CONFLICT_RADIUS_M of the query point. Reuses the same haversineM helper
 * as everything else in this module — no new distance logic.
 */
function findConflict(
  query: [number, number],
  type: CandidateInterventionType,
  existingProjects: Project[]
): { projectName: string; distanceM: number } | undefined {
  // Only ProjectType values that overlap with CandidateInterventionType can
  // conflict (existing projects use a slightly different, smaller type list
  // — see the ProjectType vs CandidateInterventionType note in types/index.ts).
  const sameType = existingProjects.filter(p => (p.type as string) === type);
  let closest: { projectName: string; distanceM: number } | undefined;
  for (const p of sameType) {
    const d = haversineM(query, [p.lng, p.lat]);
    if (d <= CONFLICT_RADIUS_M && (!closest || d < closest.distanceM)) {
      closest = { projectName: p.name, distanceM: Math.round(d) };
    }
  }
  return closest;
}

/**
 * Computes ranked suitability scores for ALL candidate intervention types
 * at a single clicked location, sorted descending by total score.
 *
 * @param lat - candidate latitude
 * @param lng - candidate longitude
 * @param gisFeatures - all loaded GIS features (water bodies, drainage, lulc, slope)
 * @param existingProjects - all existing projects, for the conflict check
 */
/** Standalone slope-category lookup, reusing the same centroid-proxy method
 * as the full scoring function — used where only the category itself is
 * needed (e.g. the 3D preview), without recomputing all 5 candidate scores. */
export function getSlopeCategoryAt(lat: number, lng: number, gisFeatures: GisFeature[]): string {
  const slopeFeatures = gisFeatures.filter(f => f.properties.layer_type === 'slope');
  return nearestPolygonCategory([lng, lat], slopeFeatures, 'Moderate');
}

/** Standalone land-use category lookup, same centroid-proxy method — used
 * by the Impact Simulation page alongside getSlopeCategoryAt. */
export function getLandUseCategoryAt(lat: number, lng: number, gisFeatures: GisFeature[]): string {
  const lulcFeatures = gisFeatures.filter(f => f.properties.layer_type === 'lulc' || f.properties.layer_type === 'vegetation');
  return nearestPolygonCategory([lng, lat], lulcFeatures, 'Agricultural');
}

export function computeAllSuitabilityScores(
  lat: number,
  lng: number,
  gisFeatures: GisFeature[],
  existingProjects: Project[]
): RankedCandidate[] {
  const query: [number, number] = [lng, lat];

  // ── Shared geographic lookups (computed once, reused for every type) ──────
  const waterBodies = gisFeatures.filter(
    f => f.properties.layer_type === 'water_bodies' || f.properties.layer_type === 'interventions'
  );
  let nearestWaterBodyM = Infinity;
  for (const wb of waterBodies) {
    if (wb.geometry.type === 'Point') {
      const d = haversineM(query, (wb.geometry as GeoJsonPoint).coordinates as [number, number]);
      if (d < nearestWaterBodyM) nearestWaterBodyM = d;
    }
  }

  const drainageLines = gisFeatures.filter(f => f.properties.layer_type === 'drainage');
  let nearestDrainageM = Infinity;
  for (const dl of drainageLines) {
    if (dl.geometry.type === 'LineString') {
      const d = distanceToLineString(query, (dl.geometry as GeoJsonLineString).coordinates as [number, number][]);
      if (d < nearestDrainageM) nearestDrainageM = d;
    }
  }

  const lulcFeatures = gisFeatures.filter(f => f.properties.layer_type === 'lulc' || f.properties.layer_type === 'vegetation');
  const landUseCategory = nearestPolygonCategory(query, lulcFeatures, 'Agricultural');

  const slopeFeatures = gisFeatures.filter(f => f.properties.layer_type === 'slope');
  const slopeCategory = nearestPolygonCategory(query, slopeFeatures, 'Moderate');

  // Shared sub-scores that don't depend on type (water/drainage proximity,
  // land-use suitability use the same LAND_USE_SCORES table as before).
  const waterScore    = proximityScore(nearestWaterBodyM === Infinity ? WATER_PROXIMITY_MAX_M : nearestWaterBodyM);
  const drainageScore = proximityScore(nearestDrainageM  === Infinity ? DRAINAGE_PROXIMITY_MAX_M : nearestDrainageM, DRAINAGE_PROXIMITY_MAX_M);
  const landUseScore  = landUseSuitability(landUseCategory);

  // ── Score every candidate type ─────────────────────────────────────────────
  const types = Object.keys(WEIGHT_PROFILES) as CandidateInterventionType[];

  const results: RankedCandidate[] = types.map(type => {
    const weights = WEIGHT_PROFILES[type];
    const slopeScore = slopeSuitability(type, slopeCategory);

    const rawTotal = Math.round(
      drainageScore * weights.drainage +
      waterScore    * weights.water    +
      landUseScore  * weights.landUse  +
      slopeScore    * weights.slope
    );

    const conflict = findConflict(query, type, existingProjects);
    const total = conflict ? Math.max(0, rawTotal - CONFLICT_PENALTY) : rawTotal;

    return {
      type,
      total,
      breakdown: {
        drainage: drainageScore,
        water: waterScore,
        landUse: landUseScore,
        slope: slopeScore,
      },
      checks: {
        nearDrainage:    drainageScore >= CHECK_PASS_THRESHOLD,
        suitableSlope:   slopeScore    >= CHECK_PASS_THRESHOLD,
        nearWaterFlow:   waterScore    >= CHECK_PASS_THRESHOLD,
        landUseSuitable: landUseScore  >= CHECK_PASS_THRESHOLD,
        noConflict:      !conflict,
      },
      conflict,
    };
  });

  results.sort((a, b) => b.total - a.total);
  return results;
}
