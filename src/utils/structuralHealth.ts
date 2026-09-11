import type { Project } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Infrastructure Inspection & Structural Health Score
//
// Distinct from the Geo-Evidence Trust Score (which assesses whether photo
// EVIDENCE is reliable). This assesses the physical CONDITION of the
// structure itself — is it aging out, overdue for inspection, or showing
// reported damage — using only data already captured for each project
// (last_inspection_date, structure_age_years, inspection_history notes).
// This is a transparent, rule-based score, not a physical/structural
// engineering simulation.
// ═══════════════════════════════════════════════════════════════════════════

export const HEALTH_CHECK_THRESHOLD = 60;

/** Typical serviceable life (years) before a structure needs major rehab. */
export const EXPECTED_SERVICE_LIFE_YEARS: Record<string, number> = {
  'Check Dam': 15,
  'Farm Pond': 10,
  'Afforestation': 20,
  'Contour Trenching': 8,
};

/** Recommended inspection interval (days) per structure type.
 *
 * Check Dam's 180-day figure is grounded in a real, published standard:
 * the Central Water Commission's official "Guidelines for Safety
 * Inspection of Dams" specifies routine periodic inspection "at least
 * twice a year: pre-monsoon and post-monsoon" for regulated dams — roughly
 * 180 days apart. (Source: https://cwc.gov.in/damsafety/safety_inspection_general
 * — see also the DHARMA portal, damsafety.cwc.gov.in, India's real dam
 * safety monitoring system under the National Dam Safety Authority.)
 *
 * One honest caveat: that CWC standard governs "Specified Dams" under the
 * Dam Safety Act 2021 — large, nationally-regulated structures. The check
 * dams in this prototype are small watershed structures, a different
 * category not directly covered by that Act. Using the same twice-yearly
 * cadence here is a reasonable, defensible benchmark, not a claim that
 * these specific mock structures are legally bound by it.
 *
 * Farm Pond, Afforestation and Contour Trenching intervals are NOT
 * grounded in a specific published standard — they're reasonable
 * estimates, not sourced figures. Worth knowing if asked directly. */
export const INSPECTION_INTERVAL_DAYS: Record<string, number> = {
  'Check Dam': 180,
  'Farm Pond': 180,
  'Afforestation': 270,
  'Contour Trenching': 180,
};

const NEGATIVE_KEYWORDS = [
  'crack', 'damage', 'erosion', 'silt', 'desilt', 'leak', 'breach',
  'block', 'overdue', 'deteriorat', 'repair', 'risk', 'failure', 'collapse',
];
const POSITIVE_KEYWORDS = [
  'intact', 'stable', 'operational', 'no issues', 'no seepage',
  'excellent', 'good condition', 'functioning well', 'well established',
];

export type HealthRating = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';

export interface StructuralHealth {
  score: number; // 0-100
  rating: HealthRating;
  checks: {
    recentlyInspected: boolean;
    noReportedDamage: boolean;
    withinServiceLife: boolean;
    regularInspectionHistory: boolean;
  };
  flaggedNotes: string[];
  daysSinceInspection: number;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function computeStructuralHealth(project: Project): StructuralHealth {
  const now = new Date();
  const lastInspection = new Date(project.last_inspection_date);
  const daysSinceInspection = daysBetween(lastInspection, now);
  const interval = INSPECTION_INTERVAL_DAYS[project.type] ?? 180;

  // ── Recency: how overdue is the last inspection? ──────────────────────────
  const recencyRatio = daysSinceInspection / interval;
  const recencyScore = Math.max(0, Math.round(100 - recencyRatio * 60));
  const recentlyInspected = daysSinceInspection <= interval;

  // ── Service life: how much of the structure's expected life is used? ──────
  const expectedLife = EXPECTED_SERVICE_LIFE_YEARS[project.type] ?? 15;
  const lifeUsedRatio = project.structure_age_years / expectedLife;
  const serviceLifeScore = Math.max(0, Math.round(100 - lifeUsedRatio * 70));
  const withinServiceLife = lifeUsedRatio <= 1;

  // ── Condition: keyword scan across inspection notes, recent-weighted ──────
  let conditionScore = 75; // neutral baseline when there's no history at all
  const flaggedNotes: string[] = [];
  const history = project.inspection_history ?? [];
  if (history.length > 0) {
    let weightedSum = 0;
    let weightTotal = 0;
    history.forEach((entry, idx) => {
      const weight = idx + 1; // later entries carry more weight
      const noteLower = entry.note.toLowerCase();
      const hasNegative = NEGATIVE_KEYWORDS.some(k => noteLower.includes(k));
      const hasPositive = POSITIVE_KEYWORDS.some(k => noteLower.includes(k));
      let entryScore = 70; // neutral note, no strong signal either way
      if (hasNegative) { entryScore = 30; flaggedNotes.push(entry.note); }
      else if (hasPositive) { entryScore = 95; }
      weightedSum += entryScore * weight;
      weightTotal += weight;
    });
    conditionScore = Math.round(weightedSum / weightTotal);
  }
  const noReportedDamage = flaggedNotes.length === 0;
  const regularInspectionHistory = history.length >= 2;

  const score = Math.round(
    recencyScore * 0.30 +
    serviceLifeScore * 0.30 +
    conditionScore * 0.40
  );

  let rating: HealthRating;
  if (score >= 85) rating = 'Excellent';
  else if (score >= 70) rating = 'Good';
  else if (score >= 50) rating = 'Fair';
  else if (score >= 30) rating = 'Poor';
  else rating = 'Critical';

  return {
    score,
    rating,
    checks: { recentlyInspected, noReportedDamage, withinServiceLife, regularInspectionHistory },
    flaggedNotes,
    daysSinceInspection,
  };
}
