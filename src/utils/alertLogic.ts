import type { Project, GeoEvidence, MaintenanceAlert, AlertSeverity } from '../types';
import { computeStructuralHealth, INSPECTION_INTERVAL_DAYS, EXPECTED_SERVICE_LIFE_YEARS } from './structuralHealth';

// ═══════════════════════════════════════════════════════════════════════════
// Live maintenance alert generation
//
// Replaces static "days_since_last_inspection" mock values with real,
// computed comparisons: actual days since last inspection vs. the
// type-specific inspection interval (the same table used by the Structural
// Health score, so the two features never disagree). Every alert carries
// explicit threshold/actual/overdue fields so the UI can show *why* it's
// flagged, not just a message string.
// ═══════════════════════════════════════════════════════════════════════════

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Severity scales with how far past the rule the actual value is, not a
 * fixed label — a project 3x over its inspection interval is a bigger
 * problem than one 5% over it. */
function severityFromOverrun(actual: number, threshold: number): AlertSeverity {
  const ratio = actual / threshold;
  if (ratio >= 2) return 'critical';
  if (ratio >= 1.5) return 'high';
  if (ratio >= 1.1) return 'medium';
  return 'low';
}

function severityFromTrustScore(score: number): AlertSeverity {
  if (score <= 1) return 'critical';
  if (score <= 2) return 'high';
  return 'medium';
}

export function computeLiveAlerts(
  projects: Project[],
  evidenceList: GeoEvidence[]
): MaintenanceAlert[] {
  const now = new Date();
  const evidenceByProject = new Map(evidenceList.map(e => [e.project_id, e]));
  const alerts: MaintenanceAlert[] = [];

  for (const project of projects) {
    const lastInspection = new Date(project.last_inspection_date);
    const actualDays = daysBetween(lastInspection, now);
    const thresholdDays = INSPECTION_INTERVAL_DAYS[project.type] ?? 180;

    // ── Rule 1: Inspection overdue ─────────────────────────────────────────
    if (actualDays > thresholdDays) {
      const overdueBy = actualDays - thresholdDays;
      alerts.push({
        id: `alert-${project.id}-overdue`,
        project_id: project.id,
        reason: 'Inspection overdue',
        severity: severityFromOverrun(actualDays, thresholdDays),
        days_since_last_inspection: actualDays,
        thresholdDays,
        actualDays,
        overdueBy,
        message: `${project.name}: inspection overdue by ${overdueBy} day${overdueBy === 1 ? '' : 's'}.`,
        detail:
          `${project.type} structures require inspection every ${thresholdDays} days. ` +
          `It has been ${actualDays} days since the last inspection (${project.last_inspection_date}) — ` +
          `${overdueBy} day${overdueBy === 1 ? '' : 's'} past the ${thresholdDays}-day threshold. ` +
          `Ranked ${severityFromOverrun(actualDays, thresholdDays)} because the overrun is ` +
          `${(actualDays / thresholdDays).toFixed(1)}× the allowed interval.`,
      });
    }

    // ── Rule 2: Evidence reliability (Trust Score) ────────────────────────
    const evidence = evidenceByProject.get(project.id);
    if (evidence && evidence.trust_score <= 2) {
      const failedChecks = (['gps_check', 'timestamp_check', 'metadata_check', 'duplicate_check'] as const)
        .filter(k => evidence[k] === 'fail');
      const isSpatialRisk = evidence.gps_check === 'fail' && evidence.distance_from_registered_location_m > 200;

      alerts.push({
        id: `alert-${project.id}-evidence`,
        project_id: project.id,
        reason: isSpatialRisk ? 'Spatial risk indicator' : 'Missing recent evidence',
        severity: severityFromTrustScore(evidence.trust_score),
        days_since_last_inspection: actualDays,
        message: isSpatialRisk
          ? `${project.name}: uploaded evidence is ${evidence.distance_from_registered_location_m}m from the registered site.`
          : `${project.name}: geo-evidence trust score ${evidence.trust_score}/5 — ${failedChecks.length} check(s) failed.`,
        detail:
          `Geo-Evidence Trust Score is ${evidence.trust_score}/5. Failed checks: ` +
          `${failedChecks.length ? failedChecks.map(k => k.replace('_check', '')).join(', ') : 'none individually, but overall score is low'}. ` +
          (isSpatialRisk
            ? `The uploaded photo's GPS location is ${evidence.distance_from_registered_location_m}m from the ` +
              `project's registered coordinates — beyond the 200m tolerance used to flag a likely location mismatch.`
            : `Low trust score reduces confidence that the uploaded evidence genuinely documents this site.`),
      });
    }

    // ── Rule 3: Structural condition (reuses the Structural Health score) ──
    const health = computeStructuralHealth(project);
    if (health.rating === 'Poor' || health.rating === 'Critical' || health.flaggedNotes.length > 0) {
      const expectedLife = EXPECTED_SERVICE_LIFE_YEARS[project.type] ?? 15;
      alerts.push({
        id: `alert-${project.id}-health`,
        project_id: project.id,
        reason: 'Structure aging',
        severity: health.rating === 'Critical' ? 'critical' : health.rating === 'Poor' ? 'high' : 'medium',
        days_since_last_inspection: actualDays,
        message: `${project.name}: structural health ${health.score}/100 (${health.rating}).`,
        detail:
          `Structural Health Score is ${health.score}/100 (${health.rating}). Structure is ` +
          `${project.structure_age_years} year(s) old against an expected service life of ${expectedLife} years. ` +
          (health.flaggedNotes.length > 0
            ? `Most recent flagged inspection note: "${health.flaggedNotes[health.flaggedNotes.length - 1]}".`
            : `No specific damage reported, but recency/service-life factors pulled the score down.`),
      });
    }
  }

  // Highest-impact issues first: severity, then how far overdue.
  const severityRank: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    return (b.overdueBy ?? 0) - (a.overdueBy ?? 0);
  });

  return alerts;
}
