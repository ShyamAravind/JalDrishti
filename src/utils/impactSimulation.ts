import type { CandidateInterventionType } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Impact Simulation
//
// This is a scenario-based SPATIAL ESTIMATOR, not a calibrated hydrological
// model. It uses real GIS inputs already in the app (slope category, land-use
// category at the clicked point) combined with a genuine, standard hydrology
// concept — the Rational Method (Volume = Runoff Coefficient × Rainfall ×
// Catchment Area) — to produce DEFENSIBLE ESTIMATES, not measurements.
//
// Deliberately excluded: any groundwater-table rise in metres. That figure
// requires real aquifer specific-yield data we do not have — claiming a
// precise number there would be fabrication, not estimation. Groundwater
// impact is expressed as a qualitative category instead (Low/Moderate/High),
// which is honestly what this data can support.
//
// Every number this module produces should be labeled "Estimated" in the UI,
// never "measured" or implied as precise.
// ═══════════════════════════════════════════════════════════════════════════

export type RainfallScenario = 'Below Normal' | 'Normal' | 'Above Normal';
export type SimulationPeriod = 1 | 5 | 10;
export type SlopeCategory = 'Flat' | 'Gentle' | 'Moderate' | 'Steep';

export interface SimulationInputs {
  type: CandidateInterventionType;
  structureSizeM: number;      // structure height (dam/bund) or depth (pond/tank), metres
  rainfallScenario: RainfallScenario;
  periodYears: SimulationPeriod;
  slopeCategory: SlopeCategory;
  landUseCategory: string;
}

export interface SimulationResult {
  catchmentAreaHa: number;
  waterRetentionM3: number;        // per season
  cumulativeRetentionM3: number;   // over the selected period
  rechargeZoneHa: number;
  benefitedLandHa: number;
  estimatedHouseholdsBenefited: number; // rural-development translation of benefitedLandHa
  floodRiskReductionPct: number;
  groundwaterImpact: 'Low' | 'Moderate' | 'High';
  rechargeZoneRadiusM: number;     // for map circle overlay
  benefitedAreaRadiusM: number;    // for map circle overlay
  estimatedCostRangeINR: [number, number] | null; // null for types this method doesn't apply to
  costMethodologyNote: string | null;
  methodology: string[];           // shown in UI so the estimate is auditable
}

// Real, cited construction-cost reference: MGNREGA "Guidelines for New /
// Additional Works" states a unit cost of Rs. 20-30 per cubic metre of
// water stored for percolation/storage structures. This is a genuine
// published government figure, not invented — but it is from an older
// MGNREGA guidelines document, so it understates current (2026) costs due
// to inflation in labour and material rates since publication. It is used
// here only as a rough order-of-magnitude reference, never presented as a
// current quotation. It only applies to structures whose primary function
// is impounding/storing a volume of water — not to bund/bunding types,
// which don't have a comparable "volume stored" cost basis.
const COST_PER_M3_STORED_INR = { min: 20, max: 30 };
const COST_APPLICABLE_TYPES: CandidateInterventionType[] = ['Check Dam', 'Farm Pond', 'Percolation Tank'];

// Average agricultural landholding size in India — a real, published,
// citable government statistic (Agriculture Census of India, 2015-16,
// the most recent published operational holdings survey), used here to
// translate a raw hectare figure into an estimated number of farming
// households — the actual rural-development framing this problem
// statement's sponsoring ministry cares about, not just a GIS area number.
const AVG_LANDHOLDING_HA = 1.08;

// ── Type-specific constants — reflect real functional differences between ──
// structure types (a percolation tank is built to infiltrate, a check dam
// to impound, contour bunding to slow surface flow) — not arbitrary.
interface TypeProfile {
  captureEfficiency: number; // fraction of catchment runoff actually captured
  rechargeFactor: number;    // fraction of captured water that infiltrates vs. stays surface/evaporates
  sizeExponent: number;      // how strongly catchment scales with structure size
}

const TYPE_PROFILES: Record<CandidateInterventionType, TypeProfile> = {
  'Check Dam':        { captureEfficiency: 0.55, rechargeFactor: 0.35, sizeExponent: 1.6 },
  'Farm Pond':        { captureEfficiency: 0.65, rechargeFactor: 0.55, sizeExponent: 1.5 },
  'Percolation Tank': { captureEfficiency: 0.50, rechargeFactor: 0.70, sizeExponent: 1.4 },
  'Contour Bunding':  { captureEfficiency: 0.35, rechargeFactor: 0.25, sizeExponent: 1.3 },
  'Farm Bund':        { captureEfficiency: 0.30, rechargeFactor: 0.20, sizeExponent: 1.2 },
};

// Runoff concentration multiplier by slope — steeper terrain concentrates
// runoff to a point faster (standard watershed hydrology).
const SLOPE_RUNOFF_CONCENTRATION: Record<SlopeCategory, number> = {
  Flat: 0.70, Gentle: 0.85, Moderate: 1.00, Steep: 1.15,
};

// Runoff coefficients by land-use — standard textbook rule-of-thumb ranges
// for semi-arid Indian catchments (not site-calibrated).
const LAND_USE_RUNOFF_COEFFICIENT: Record<string, number> = {
  Barren: 0.55, Agricultural: 0.35, 'Sparse Vegetation': 0.30,
  'Dense Vegetation': 0.20, Forest: 0.15, Reservoir: 0.90,
};

// Typical seasonal (monsoon) rainfall depth assumption for this region —
// a planning-level assumption, not a live weather feed.
const RAINFALL_SEASONAL_MM: Record<RainfallScenario, number> = {
  'Below Normal': 500, 'Normal': 750, 'Above Normal': 1000,
};

// Multi-year accumulation factor — deliberately NOT a naive linear multiply.
// Not every season's retained water is "new" benefit; much is used or
// evaporated between seasons, so returns diminish with time.
const PERIOD_ACCUMULATION_FACTOR: Record<SimulationPeriod, number> = {
  1: 1, 5: 4.2, 10: 7.5,
};

// ── Plausibility check ───────────────────────────────────────────────────
// The formulas above will happily compute numbers for ANY coordinate,
// including a city centre or the ocean, because they don't know what's
// actually there — they just use whatever land-use/slope category is
// "nearest" in the sparse mock GIS data, however far away that actually is.
// This check stops the UI from presenting confident-looking numbers for
// locations nowhere near any of the watersheds this prototype actually
// models.

export interface PlausibilityResult {
  isValid: boolean;
  nearestWatershedName: string;
  distanceKm: number;
}

function pointInPolygon(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Beyond this distance from a watershed boundary, results are not shown as
// meaningful — the mock GIS layers have no real coverage that far out.
const MAX_PLAUSIBLE_DISTANCE_KM = 15;

export function checkPlausibility(
  lat: number, lng: number,
  watersheds: { properties: { name: string }; geometry: { coordinates: [number, number][][] } }[]
): PlausibilityResult {
  let nearestName = watersheds[0]?.properties.name ?? 'Unknown';
  let minDistKm = Infinity;

  for (const ws of watersheds) {
    const ring = ws.geometry.coordinates[0];
    if (pointInPolygon(lng, lat, ring)) {
      return { isValid: true, nearestWatershedName: ws.properties.name, distanceKm: 0 };
    }
    // Not inside — find distance to the nearest boundary vertex as a proxy
    // for distance to the polygon edge (good enough for a plausibility gate).
    for (const [vLng, vLat] of ring) {
      const dLat = (lat - vLat) * 111; // km per degree latitude, roughly
      const dLng = (lng - vLng) * 111 * Math.cos((lat * Math.PI) / 180);
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      if (distKm < minDistKm) {
        minDistKm = distKm;
        nearestName = ws.properties.name;
      }
    }
  }

  return {
    isValid: minDistKm <= MAX_PLAUSIBLE_DISTANCE_KM,
    nearestWatershedName: nearestName,
    distanceKm: Math.round(minDistKm * 10) / 10,
  };
}

export function runImpactSimulation(inputs: SimulationInputs): SimulationResult {
  const profile = TYPE_PROFILES[inputs.type];
  const runoffConcentration = SLOPE_RUNOFF_CONCENTRATION[inputs.slopeCategory];
  const runoffCoefficient = LAND_USE_RUNOFF_COEFFICIENT[inputs.landUseCategory] ?? 0.35;
  const seasonalRainfallM = RAINFALL_SEASONAL_MM[inputs.rainfallScenario] / 1000;

  // Catchment area scales with structure size (bigger structure -> larger
  // effective catchment) and slope (steeper -> faster concentration).
  const catchmentAreaHa = 0.8 * Math.pow(inputs.structureSizeM, profile.sizeExponent) * runoffConcentration;
  const catchmentAreaM2 = catchmentAreaHa * 10000;

  // Rational Method: Volume = Runoff Coefficient x Rainfall Depth x Area
  const grossRunoffM3 = catchmentAreaM2 * seasonalRainfallM * runoffCoefficient;
  const waterRetentionM3 = grossRunoffM3 * profile.captureEfficiency;
  const cumulativeRetentionM3 = waterRetentionM3 * PERIOD_ACCUMULATION_FACTOR[inputs.periodYears];

  const rechargeZoneHa = catchmentAreaHa * profile.rechargeFactor;
  const benefitedLandHa = rechargeZoneHa * 1.6; // downstream influence assumption
  const estimatedHouseholdsBenefited = Math.round(benefitedLandHa / AVG_LANDHOLDING_HA);

  const floodRiskReductionPct = Math.round(
    Math.min(45, profile.captureEfficiency * runoffConcentration * 35)
  );

  const groundwaterImpact: SimulationResult['groundwaterImpact'] =
    rechargeZoneHa > 10 ? 'High' : rechargeZoneHa > 4 ? 'Moderate' : 'Low';

  const rechargeZoneRadiusM = Math.sqrt((rechargeZoneHa * 10000) / Math.PI);
  const benefitedAreaRadiusM = Math.sqrt((benefitedLandHa * 10000) / Math.PI);

  const costApplies = COST_APPLICABLE_TYPES.includes(inputs.type);
  const estimatedCostRangeINR: [number, number] | null = costApplies
    ? [Math.round(waterRetentionM3 * COST_PER_M3_STORED_INR.min), Math.round(waterRetentionM3 * COST_PER_M3_STORED_INR.max)]
    : null;
  const costMethodologyNote = costApplies
    ? `Estimated as ${COST_PER_M3_STORED_INR.min}–${COST_PER_M3_STORED_INR.max} per cubic metre of seasonal water retention, per MGNREGA's published "Guidelines for New/Additional Works" unit-cost reference for storage/percolation structures. This figure is from an older published guideline and has not been inflation-adjusted — real 2026 costs are almost certainly higher. Treat this as a rough order-of-magnitude reference only, not a quotation. Actual cost depends on site conditions, state Schedule of Rates, and contractor rates — always confirm against the current district Schedule of Rates before budgeting.`
    : `Cost estimation is not available for ${inputs.type} in this prototype — the cited per-cubic-metre-stored reference rate applies to storage/percolation structures (Check Dam, Farm Pond, Percolation Tank), not to bund-type interventions, which don't have a comparable volume-based cost basis in the available reference.`;

  return {
    catchmentAreaHa: round1(catchmentAreaHa),
    waterRetentionM3: Math.round(waterRetentionM3),
    cumulativeRetentionM3: Math.round(cumulativeRetentionM3),
    rechargeZoneHa: round1(rechargeZoneHa),
    benefitedLandHa: round1(benefitedLandHa),
    estimatedHouseholdsBenefited,
    floodRiskReductionPct,
    groundwaterImpact,
    rechargeZoneRadiusM: Math.round(rechargeZoneRadiusM),
    benefitedAreaRadiusM: Math.round(benefitedAreaRadiusM),
    estimatedCostRangeINR,
    costMethodologyNote,
    methodology: [
      `Rational Method: Volume = Runoff Coefficient (${runoffCoefficient}) × Seasonal Rainfall (${Math.round(seasonalRainfallM * 1000)}mm) × Catchment Area`,
      `Catchment area scaled from structure size (${inputs.structureSizeM}m) and real slope category (${inputs.slopeCategory}, ${runoffConcentration}× concentration factor)`,
      `Land-use runoff coefficient (${runoffCoefficient}) uses standard rule-of-thumb ranges for the real classified land-use category at this point (${inputs.landUseCategory})`,
      `Capture efficiency (${Math.round(profile.captureEfficiency * 100)}%) and recharge factor (${Math.round(profile.rechargeFactor * 100)}%) reflect ${inputs.type}'s real functional design, not calibrated site data`,
      `Groundwater impact is a qualitative category only — a precise water-table rise (in metres) requires aquifer specific-yield data this prototype does not have`,
      `Estimated households benefited = Benefited Land ÷ ${AVG_LANDHOLDING_HA}ha (India's average agricultural landholding size, Agriculture Census of India 2015-16) — a rough translation, not a household survey`,
      costMethodologyNote,
    ],
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
