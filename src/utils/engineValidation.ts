import type { Project, GisFeature, CandidateInterventionType } from '../types';
import { computeAllSuitabilityScores } from './whatIfScore';

// ═══════════════════════════════════════════════════════════════════════════
// Recommendation Engine validation ("backtesting")
//
// We can't train an ML model — there's no outcome-labeled training set, just
// 17 project records. What we CAN honestly do is check whether the engine's
// top-ranked recommendation matches what was actually built at each real
// project's real coordinates. This is a legitimate way to validate a
// rule-based/heuristic system (distinct from training one), and gives a
// real, reportable accuracy number instead of an unverifiable claim.
//
// LIMITATION, stated plainly: the app's real ProjectType list ('Check Dam',
// 'Farm Pond', 'Afforestation', 'Contour Trenching') doesn't map 1:1 onto
// the Recommendation Engine's 5 candidate types. Only Check Dam and Farm
// Pond are exact matches. Contour Trenching is treated as a near-match for
// Contour Bunding (similar but not identical intervention). Afforestation
// has no equivalent candidate type at all and is excluded — validating
// against it would be meaningless, not just imprecise.
// ═══════════════════════════════════════════════════════════════════════════

const TYPE_MAPPING: Partial<Record<string, CandidateInterventionType>> = {
  'Check Dam': 'Check Dam',
  'Farm Pond': 'Farm Pond',
  'Contour Trenching': 'Contour Bunding', // near-match, not identical
};

export interface ValidationResult {
  totalEligible: number;
  totalExcluded: number;
  excludedReason: string;
  topPickMatches: number;
  accuracy: number; // 0-100, exact #1 match
  top3Matches: number;
  top3Accuracy: number; // 0-100, real type appears anywhere in the top 3
  details: {
    projectId: string;
    projectName: string;
    actualType: string;
    mappedType: CandidateInterventionType;
    isNearMatch: boolean;
    predictedTop: CandidateInterventionType;
    predictedScore: number;
    matched: boolean;
    rankOfActual: number; // 1-5, where the real type landed in our ranking
  }[];
}

export function validateRecommendationEngine(
  projects: Project[],
  gisFeatures: GisFeature[]
): ValidationResult {
  const details: ValidationResult['details'] = [];
  let excluded = 0;

  for (const project of projects) {
    const mappedType = TYPE_MAPPING[project.type];
    if (!mappedType) { excluded++; continue; }

    const otherProjects = projects.filter(p => p.id !== project.id);
    const results = computeAllSuitabilityScores(
      project.lat, project.lng, gisFeatures, otherProjects
    );
    const top = results[0];
    const rankOfActual = results.findIndex(r => r.type === mappedType) + 1; // 1-indexed

    details.push({
      projectId: project.id,
      projectName: project.name,
      actualType: project.type,
      mappedType,
      isNearMatch: project.type === 'Contour Trenching',
      predictedTop: top.type,
      predictedScore: top.total,
      matched: top.type === mappedType,
      rankOfActual,
    });
  }

  const topPickMatches = details.filter(d => d.matched).length;
  const top3Matches = details.filter(d => d.rankOfActual <= 3).length;

  return {
    totalEligible: details.length,
    totalExcluded: excluded,
    excludedReason: 'Afforestation has no equivalent candidate type in the Recommendation Engine.',
    topPickMatches,
    accuracy: details.length ? Math.round((topPickMatches / details.length) * 100) : 0,
    top3Matches,
    top3Accuracy: details.length ? Math.round((top3Matches / details.length) * 100) : 0,
    details,
  };
}
