import type { GeoEvidence } from '../types';
import geoEvidenceData from '../data/geoEvidence.json';

const evidenceList = geoEvidenceData as GeoEvidence[];

export async function getGeoEvidence(): Promise<GeoEvidence[]> {
  return evidenceList;
}

export async function getEvidenceByProject(projectId: string): Promise<GeoEvidence | undefined> {
  return evidenceList.find(e => e.project_id === projectId);
}

export function computeAverageTrustScore(evidence: GeoEvidence[]): number {
  if (evidence.length === 0) return 0;
  const total = evidence.reduce((sum, e) => sum + e.trust_score, 0);
  return Math.round((total / evidence.length) * 10) / 10;
}
