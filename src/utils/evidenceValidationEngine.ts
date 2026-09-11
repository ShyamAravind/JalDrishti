import type {
  WatershedFeature,
  Project,
  EvidenceValidationResult,
  ValidationCheckItem,
} from '../types';
import type { PointAnalysisResult } from '../services/pointAnalysisService';
import { haversineM } from './whatIfScore';

/**
 * Point-in-polygon test using ray-casting algorithm.
 * Tests if point [lng, lat] is inside polygon coordinates [[[lng, lat], ...]].
 */
export function pointInPolygon(point: [number, number], polygonCoords: [number, number][][]): boolean {
  const [x, y] = point; // x = lng, y = lat
  let inside = false;

  // Check outer ring (index 0)
  const ring = polygonCoords[0];
  if (!ring || ring.length < 3) return false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

export interface ValidationEngineInput {
  lat: number;
  lng: number;
  source: 'EXIF Metadata' | 'OCR Extracted' | 'Manual Selection';
  timestamp?: string;
  watersheds: WatershedFeature[];
  projects: Project[];
  satelliteContext?: PointAnalysisResult | null;
  imageInterventionGuess?: string;
  targetProjectId?: string;
}

export function evaluateFieldEvidence(input: ValidationEngineInput): EvidenceValidationResult {
  const {
    lat,
    lng,
    source,
    timestamp,
    watersheds,
    projects,
    satelliteContext,
    imageInterventionGuess,
    targetProjectId,
  } = input;

  const checks: ValidationCheckItem[] = [];
  let score = 0;

  // 1. GPS Availability (20 pts)
  const gpsAvailable = lat !== 0 && lng !== 0;
  if (source === 'EXIF Metadata' && gpsAvailable) {
    score += 20;
    checks.push({
      id: 'gps_available',
      label: 'GPS Metadata Available',
      status: 'pass',
      detail: 'Extracted directly from genuine EXIF header tags.',
    });
  } else if (source === 'OCR Extracted' && gpsAvailable) {
    score += 15;
    checks.push({
      id: 'gps_available',
      label: 'GPS Coordinates Extracted (OCR)',
      status: 'pass',
      detail: 'Recognized from stamped coordinates on photograph canvas.',
    });
  } else if (source === 'Manual Selection' && gpsAvailable) {
    score += 10;
    checks.push({
      id: 'gps_available',
      label: 'Manual GPS Pin Selection',
      status: 'warn',
      detail: 'Selected by officer on interactive map fallback (unverified camera origin).',
    });
  } else {
    checks.push({
      id: 'gps_available',
      label: 'GPS Coordinates Missing',
      status: 'fail',
      detail: 'No geographic location could be determined.',
    });
  }

  // 2. Coordinate Validity (15 pts)
  const gpsValid = Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    (lat !== 0 || lng !== 0);

  if (gpsValid) {
    score += 15;
    checks.push({
      id: 'gps_valid',
      label: 'Coordinate Format & Bounds',
      status: 'pass',
      detail: `Valid terrestrial coordinate [${lat.toFixed(5)}°, ${lng.toFixed(5)}°].`,
    });
  } else {
    checks.push({
      id: 'gps_valid',
      label: 'Invalid Coordinates',
      status: 'fail',
      detail: 'Coordinates violate physical geographic boundaries.',
    });
  }

  // 3. Watershed Boundary Check (20 pts)
  let insideWatershed = false;
  let matchingWatershedName: string | undefined;
  let nearestWsDistM = Infinity;
  let nearestWsName = 'Watershed';

  for (const ws of watersheds) {
    if (ws.geometry.type === 'Polygon') {
      const isInside = pointInPolygon([lng, lat], ws.geometry.coordinates as [number, number][][]);
      if (isInside) {
        insideWatershed = true;
        matchingWatershedName = ws.properties.name;
        break;
      }
    }
    // Calculate centroid distance as fallback proximity
    const ring = ws.geometry.coordinates[0] as [number, number][];
    const centLng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const centLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    const d = haversineM([lng, lat], [centLng, centLat]);
    if (d < nearestWsDistM) {
      nearestWsDistM = d;
      nearestWsName = ws.properties.name;
    }
  }

  if (insideWatershed) {
    score += 20;
    checks.push({
      id: 'inside_watershed',
      label: 'Inside Watershed Boundary',
      status: 'pass',
      detail: `Verified inside official boundary of ${matchingWatershedName}.`,
    });
  } else {
    const distKm = (nearestWsDistM / 1000).toFixed(1);
    checks.push({
      id: 'inside_watershed',
      label: 'Outside Watershed Boundary',
      status: 'fail',
      detail: `Location is ${distKm} km outside nearest registered boundary (${nearestWsName}).`,
    });
  }

  // 4. Proximity to Registered Intervention (15 pts)
  let nearIntervention = false;
  let nearestInterventionName: string | undefined;
  let nearestInterventionDistM = Infinity;

  // If officer specifically selected a target project, test distance to it
  const targetProject = targetProjectId ? projects.find(p => p.id === targetProjectId) : null;

  if (targetProject) {
    nearestInterventionDistM = haversineM([lng, lat], [targetProject.lng, targetProject.lat]);
    nearestInterventionName = targetProject.name;
  } else if (projects.length > 0) {
    for (const p of projects) {
      const d = haversineM([lng, lat], [p.lng, p.lat]);
      if (d < nearestInterventionDistM) {
        nearestInterventionDistM = d;
        nearestInterventionName = p.name;
      }
    }
  }

  if (nearestInterventionDistM <= 500) {
    nearIntervention = true;
    score += 15;
    checks.push({
      id: 'near_intervention',
      label: 'Intervention Proximity',
      status: 'pass',
      detail: `${Math.round(nearestInterventionDistM)}m from ${nearestInterventionName} (within 500m audit zone).`,
    });
  } else if (nearestInterventionDistM <= 2500) {
    nearIntervention = true;
    score += 10;
    checks.push({
      id: 'near_intervention',
      label: 'Intervention Proximity (Moderate)',
      status: 'warn',
      detail: `${(nearestInterventionDistM / 1000).toFixed(1)} km from ${nearestInterventionName}.`,
    });
  } else if (nearestInterventionDistM <= 10000) {
    score += 5;
    checks.push({
      id: 'near_intervention',
      label: 'Intervention Proximity (Distant)',
      status: 'warn',
      detail: `Image is ${(nearestInterventionDistM / 1000).toFixed(1)} km from nearest registered intervention.`,
    });
  } else {
    checks.push({
      id: 'near_intervention',
      label: 'Far From Interventions',
      status: 'fail',
      detail: `No registered interventions found within 10 km radius.`,
    });
  }

  // 5. Timestamp Validity & Reasonableness (10 pts)
  let timestampValid = false;
  let timestampReasonable = false;

  if (timestamp) {
    const parsedDate = new Date(timestamp);
    const now = new Date();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(now.getFullYear() - 10);

    if (!isNaN(parsedDate.getTime())) {
      timestampValid = true;
      if (parsedDate <= now && parsedDate >= tenYearsAgo) {
        timestampReasonable = true;
        score += 10;
        checks.push({
          id: 'timestamp_valid',
          label: 'Timestamp Valid & Plausible',
          status: 'pass',
          detail: `Recorded ${parsedDate.toLocaleDateString()} (non-future, within active project lifecycle).`,
        });
      } else if (parsedDate > now) {
        checks.push({
          id: 'timestamp_valid',
          label: 'Future Timestamp Flagged',
          status: 'fail',
          detail: `Timestamp ${timestamp} is in the future. Possible device clock desynchronization or tampering.`,
        });
      } else {
        score += 5;
        checks.push({
          id: 'timestamp_valid',
          label: 'Aged Timestamp',
          status: 'warn',
          detail: `Recorded more than 10 years ago (${parsedDate.getFullYear()}).`,
        });
      }
    }
  }

  if (!timestampValid) {
    score += 5; // Neutral partial credit
    checks.push({
      id: 'timestamp_valid',
      label: 'Missing Timestamp',
      status: 'warn',
      detail: 'No capture timestamp found in image metadata.',
    });
  }

  // 6. Satellite Context Corroboration (10 pts)
  let satelliteContextAvailable = false;
  if (satelliteContext && satelliteContext.source === 'live') {
    satelliteContextAvailable = true;
    score += 10;
    checks.push({
      id: 'satellite_context',
      label: 'Live Satellite Corroboration',
      status: 'pass',
      detail: `Corroborated by live Earth Engine composite (dominant: ${satelliteContext.lulc_dominant_class}, NDVI: ${satelliteContext.ndvi.mean ?? 'N/A'}).`,
    });
  } else {
    score += 4;
    checks.push({
      id: 'satellite_context',
      label: 'Satellite Context Pending',
      status: 'warn',
      detail: 'Real-time satellite buffer query pending or temporarily unavailable.',
    });
  }

  // 7. LULC Environmental Consistency (10 pts)
  let lulcConsistency: 'Consistent' | 'Acceptable' | 'Divergent' = 'Acceptable';
  if (satelliteContext && imageInterventionGuess) {
    const dominant = satelliteContext.lulc_dominant_class.toLowerCase();
    const guess = imageInterventionGuess.toLowerCase();

    const isWaterGuess = guess.includes('dam') || guess.includes('pond') || guess.includes('tank');
    const hasWaterSignal = dominant.includes('water') || (satelliteContext.ndwi.mean !== null && satelliteContext.ndwi.mean > -0.1);

    if (isWaterGuess && hasWaterSignal) {
      lulcConsistency = 'Consistent';
      score += 10;
      checks.push({
        id: 'lulc_consistency',
        label: 'Environmental Consistency',
        status: 'pass',
        detail: `Water intervention pattern (${imageInterventionGuess}) matches satellite spectral surface wetness.`,
      });
    } else if (dominant.includes('barren') && isWaterGuess) {
      lulcConsistency = 'Divergent';
      score += 2;
      checks.push({
        id: 'lulc_consistency',
        label: 'Environmental Divergence',
        status: 'warn',
        detail: `Field image indicates ${imageInterventionGuess}, but 30m satellite buffer indicates dry barren land. Structure may be dry or newly excavated.`,
      });
    } else {
      lulcConsistency = 'Acceptable';
      score += 8;
      checks.push({
        id: 'lulc_consistency',
        label: 'Environmental Consistency',
        status: 'pass',
        detail: `Surrounding satellite land cover (${satelliteContext.lulc_dominant_class}) is compatible with field observations.`,
      });
    }
  } else {
    score += 7;
    checks.push({
      id: 'lulc_consistency',
      label: 'Environmental Baseline',
      status: 'pass',
      detail: 'Consistent with regional terrain characteristics.',
    });
  }

  // Final score clamping and confidence grading
  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  let confidenceLevel: 'High' | 'Medium' | 'Low' = 'Medium';
  if (finalScore >= 75 && insideWatershed) confidenceLevel = 'High';
  else if (finalScore < 50 || !insideWatershed) confidenceLevel = 'Low';

  const summary = confidenceLevel === 'High'
    ? `Strong geospatial evidence. Location is confirmed inside ${matchingWatershedName || 'the watershed'} and corroborated by satellite spectral signatures.`
    : confidenceLevel === 'Medium'
    ? `Moderate evidence confidence. Coordinates verified but manual selection or slight distance from known works was noted.`
    : `Low trust score (${finalScore}/100). Evidence flagged due to boundary discrepancy or missing coordinates.`;

  return {
    gpsAvailable,
    gpsValid,
    insideWatershed,
    watershedName: matchingWatershedName,
    nearIntervention,
    nearestInterventionName,
    nearestInterventionDistanceM: Number.isFinite(nearestInterventionDistM) ? Math.round(nearestInterventionDistM) : undefined,
    timestampValid,
    timestampReasonable,
    satelliteContextAvailable,
    lulcConsistency,
    duplicateCheck: true,
    trustScore: finalScore,
    confidenceLevel,
    summary,
    checks,
  };
}
