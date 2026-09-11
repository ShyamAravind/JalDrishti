import type { GeoEvidence, CheckResult } from '../types';

/**
 * Computes a trust score (1–5) from raw geo-evidence checks.
 *   5 = all 4 checks pass
 *   Score decreases by 1 for each failed check, minimum 1.
 *
 * This utility exists as a visible, explainable scoring function so the
 * logic is transparent and easy to describe to judges / reviewers.
 * When a real upload flow exists, call this after parsing photo metadata.
 */
export function computeTrustScore(checks: {
  gps_check: CheckResult;
  timestamp_check: CheckResult;
  metadata_check: CheckResult;
  duplicate_check: CheckResult;
}): number {
  const allChecks: CheckResult[] = [
    checks.gps_check,
    checks.timestamp_check,
    checks.metadata_check,
    checks.duplicate_check,
  ];
  const failCount = allChecks.filter(c => c === 'fail').length;
  return Math.max(1, 5 - failCount);
}

/**
 * Returns a human-readable label for a trust score.
 */
export function trustScoreLabel(score: number): string {
  if (score >= 5) return 'High Trust';
  if (score === 4) return 'Good';
  if (score === 3) return 'Moderate';
  if (score === 2) return 'Low Trust';
  return 'Unverified';
}

/**
 * Returns a Tailwind colour class for a given trust score.
 */
export function trustScoreColorClass(score: number): string {
  if (score >= 4) return 'text-tertiary-500';
  if (score === 3) return 'text-primary-500';
  if (score === 2) return 'text-accent-500';
  return 'text-red-600';
}

/**
 * Validates that a GeoEvidence object's trust_score field is consistent
 * with its check results. Useful when ingesting from the API later.
 */
export function validateEvidenceIntegrity(evidence: GeoEvidence): boolean {
  const computed = computeTrustScore(evidence);
  return computed === evidence.trust_score;
}
