// ── Watersheds ────────────────────────────────────────────────────────────────
export interface WatershedProperties {
  id: string;
  name: string;
  district: string;
  state: string;
  area_sq_km: number;
}

export interface WatershedFeature {
  type: 'Feature';
  id: string;
  properties: WatershedProperties;
  geometry: GeoJsonPolygon;
}

export interface WatershedCollection {
  type: 'FeatureCollection';
  features: WatershedFeature[];
}

// ── GIS Layers ────────────────────────────────────────────────────────────────
export type GisLayerType =
  | 'lulc'
  | 'vegetation'
  | 'drainage'
  | 'water_bodies'
  | 'interventions'
  | 'slope';

export interface GisFeatureProperties {
  id: string;
  watershed_id: string;
  layer_type: GisLayerType;
  category: string;
  label: string;
}

export type GisFeature = GeoJsonFeature<GisFeatureProperties>;

export interface GisLayerCollection {
  type: 'FeatureCollection';
  features: GisFeature[];
}

// ── Projects ──────────────────────────────────────────────────────────────────
export type ProjectType =
  | 'Check Dam'
  | 'Farm Pond'
  | 'Afforestation'
  | 'Contour Trenching';

export type ProjectStatus = 'Completed' | 'Ongoing' | 'Delayed';

export interface InspectionEntry {
  date: string;
  note: string;
}

export interface PhotoRecord {
  url: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface ProjectPhotos {
  before: PhotoRecord;
  after: PhotoRecord;
}

export interface Project {
  id: string;
  name: string;
  watershed_id: string;
  district: string;
  lat: number;
  lng: number;
  type: ProjectType;
  status: ProjectStatus;
  completion_pct: number;
  start_date: string;
  structure_age_years: number;
  last_inspection_date: string;
  inspection_history: InspectionEntry[];
  photos: ProjectPhotos;
}

// ── Geo Evidence ──────────────────────────────────────────────────────────────
export type CheckResult = 'pass' | 'fail';

export interface GeoEvidence {
  project_id: string;
  gps_check: CheckResult;
  timestamp_check: CheckResult;
  metadata_check: CheckResult;
  duplicate_check: CheckResult;
  distance_from_registered_location_m: number;
  trust_score: number; // 1–5
}

// ── LULC Trend ────────────────────────────────────────────────────────────────
export interface LulcTrendEntry {
  watershed_id: string;
  years: number[];
  forest_pct: number[];
  agricultural_pct: number[];
  water_bodies_pct: number[];
  barren_degraded_pct: number[];
}

// ── Maintenance Alerts ────────────────────────────────────────────────────────
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export type AlertReason =
  | 'Inspection overdue'
  | 'Missing recent evidence'
  | 'Structure aging'
  | 'Spatial risk indicator';

export interface MaintenanceAlert {
  id: string;
  project_id: string;
  reason: AlertReason;
  severity: AlertSeverity;
  days_since_last_inspection: number; // live-computed, not a static mock value
  message: string;
  // Structured explanation fields — power the "why is this flagged" detail view.
  thresholdDays?: number;   // the applicable rule (e.g. 90-day inspection interval)
  actualDays?: number;      // the real measured value being compared against it
  overdueBy?: number;       // actualDays - thresholdDays, when relevant
  detail?: string;          // longer, structured explanation of the specific breach
}

// ── What-If Simulator ─────────────────────────────────────────────────────────
export interface CandidatePoint {
  id: string;
  type: ProjectType;
  lat: number;
  lng: number;
  scores: {
    distanceToWaterBody: number;  // normalised 0–100
    distanceToDrainage: number;   // normalised 0–100
    landUseSuitability: number;   // normalised 0–100
    total: number;                // weighted average
  };
  nearestWaterBodyM: number;
  nearestDrainageM: number;
  landUseCategory: string;
}

// ── Multi-type ranked suitability (What-If Simulator v2) ─────────────────────
export type CandidateInterventionType =
  | 'Check Dam'
  | 'Farm Pond'
  | 'Percolation Tank'
  | 'Contour Bunding'
  | 'Farm Bund';

export interface RankedCandidateBreakdown {
  drainage: number; // 0-100
  water: number;    // 0-100
  landUse: number;  // 0-100
  slope: number;    // 0-100
}

export interface RankedCandidateChecks {
  nearDrainage: boolean;
  suitableSlope: boolean;
  nearWaterFlow: boolean;
  landUseSuitable: boolean;
  noConflict: boolean;
}

export interface RankedCandidateConflict {
  projectName: string;
  distanceM: number;
}

export interface RankedCandidate {
  type: CandidateInterventionType;
  total: number; // 0-100, after conflict penalty if any
  breakdown: RankedCandidateBreakdown;
  checks: RankedCandidateChecks;
  conflict?: RankedCandidateConflict;
}

export interface RankedLocation {
  id: string;
  lat: number;
  lng: number;
  results: RankedCandidate[]; // sorted descending by total
}

// ── Generic GeoJSON helpers ───────────────────────────────────────────────────
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export type GeoJsonGeometry = GeoJsonPoint | GeoJsonPolygon | GeoJsonMultiPolygon | GeoJsonLineString;

export interface GeoJsonFeature<P = Record<string, unknown>> {
  type: 'Feature';
  properties: P;
  geometry: GeoJsonGeometry;
}

// ── Satellite Provider & Analysis Contracts ──────────────────────────────────
export interface SatelliteProviderMeta {
  provider: string;
  type: 'active' | 'adapter' | 'mock';
  configured: boolean;
  serviceAccount?: string | null;
  supportedSensors: string[];
  operationalCapabilities: string[];
}

export interface SatelliteStatusResponse {
  activeProvider: string;
  providers: {
    earthEngine: SatelliteProviderMeta;
    srishtiDrishti: {
      provider: string;
      type: string;
      status: string;
      configured: boolean;
      endpoint: string;
      agency: string;
      supportedSensors: string[];
      note: string;
    };
  };
  configuredWatersheds: { id: string; name: string }[];
}

export interface Sentinel1SoilMoistureResult {
  watershed_id: string;
  watershed_name: string;
  sufficient_data: boolean;
  metric?: string;
  methodology?: string;
  disclaimer?: string;
  periods?: {
    before: { range: string; observation_count: number; mean_backscatter_db: number; ssmi_pct: number };
    after: { range: string; observation_count: number; mean_backscatter_db: number; ssmi_pct: number };
  };
  change?: {
    backscatter_delta_db: number;
    ssmi_absolute_delta_pct: number;
    ssmi_relative_change_pct: number | null;
    trend: 'Moisture Improvement' | 'Moisture Deficit' | 'Stable';
  };
  observation_counts?: { before: number; after: number };
  message?: string;
  source: string;
  provider: string;
  dataset: string;
  spatial_resolution_m?: number;
  computed_at: string;
}

export interface TemporalChangeResult {
  watershed_id: string;
  watershed_name: string;
  before_year: number;
  after_year: number;
  metrics_before: {
    forest_pct: number;
    agricultural_pct: number;
    water_bodies_pct: number;
    barren_degraded_pct: number;
    ndvi_mean: number | null;
    ndwi_mean: number | null;
  };
  metrics_after: {
    forest_pct: number;
    agricultural_pct: number;
    water_bodies_pct: number;
    barren_degraded_pct: number;
    ndvi_mean: number | null;
    ndwi_mean: number | null;
  };
  deltas: {
    forest_pct: number;
    agricultural_pct: number;
    water_bodies_pct: number;
    barren_degraded_pct: number;
    ndvi_mean: number | null;
    ndwi_mean: number | null;
  };
  vegetation_trend: string;
  source: string;
  provider: string;
  dataset: string;
  computed_at: string;
}

export interface LandDegradationResult {
  watershed_id: string;
  watershed_name: string;
  year: number;
  degradation_risk: 'Low' | 'Moderate' | 'High';
  degradation_index: number; // 0 - 100
  factor_breakdown: {
    barren_soil_exposure: { score: number; weight: string; measured_barren_pct: number };
    vegetation_vigor_stress: { score: number; weight: string; measured_ndvi: number };
    topographic_slope_vulnerability: { score: number; weight: string; mean_slope_degrees: number };
    surface_moisture_deficit: { score: number; weight: string; measured_ndwi: number };
  };
  methodology: string;
  disclaimer: string;
  source: string;
  provider: string;
  dataset: string;
  computed_at: string;
}

// ── Evidence Validation Engine ────────────────────────────────────────────────
export interface ValidationCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface EvidenceValidationResult {
  gpsAvailable: boolean;
  gpsValid: boolean;
  insideWatershed: boolean;
  watershedName?: string;
  nearIntervention: boolean;
  nearestInterventionName?: string;
  nearestInterventionDistanceM?: number;
  timestampValid: boolean;
  timestampReasonable: boolean;
  satelliteContextAvailable: boolean;
  lulcConsistency: 'Consistent' | 'Acceptable' | 'Divergent';
  duplicateCheck: boolean;
  trustScore: number; // 0–100 calculated
  confidenceLevel: 'High' | 'Medium' | 'Low';
  summary: string;
  checks: ValidationCheckItem[];
}

// ── Intervention Assessment & Ranking ─────────────────────────────────────────
export interface InterventionAssessment {
  projectId: string;
  name: string;
  type: ProjectType;
  watershedId: string;
  district: string;
  lat: number;
  lng: number;
  ndviChange: number;
  soilMoistureEnhancementPct: number;
  wetnessChange: number;
  benefitedAreaHa: number;
  riskReductionPct: number;
  effectivenessScore: number; // 0–100 calculated
  confidence: 'High' | 'Medium' | 'Low';
  assessmentDate: string;
}

export interface InterventionRankingItem {
  type: string;
  count: number;
  averageEffectiveness: number;
  averageBenefitedAreaHa: number;
  confidence: 'High' | 'Medium' | 'Low';
}

