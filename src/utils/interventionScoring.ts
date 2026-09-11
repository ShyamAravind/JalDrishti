import type {
  Project,
  
  InterventionAssessment,
  InterventionRankingItem,
} from '../types';

/**
 * Computes measurable environmental and agricultural impact indicators
 * for an intervention structure based on its type, location, age, and completion status.
 */
export function assessIntervention(project: Project): InterventionAssessment {
  // Completion factor (0.0 to 1.0)
  const compFactor = (project.completion_pct || 0) / 100;
  const ageYears = project.structure_age_years || 1;

  // Base metrics by type based on hydrological watershed engineering principles
  let baseNdviDelta = 0.05;
  let baseMoistureEnhancement = 12.0; // SSMI % increase
  let baseBenefitedHa = 25.0;
  let baseRiskReduction = 40.0;

  switch (project.type) {
    case 'Check Dam':
      baseNdviDelta = 0.12;
      baseMoistureEnhancement = 22.5;
      baseBenefitedHa = 45.0;
      baseRiskReduction = 65.0;
      break;
    case 'Farm Pond':
      baseNdviDelta = 0.09;
      baseMoistureEnhancement = 18.0;
      baseBenefitedHa = 15.0;
      baseRiskReduction = 50.0;
      break;
    case 'Afforestation':
      baseNdviDelta = 0.18;
      baseMoistureEnhancement = 14.0;
      baseBenefitedHa = 60.0;
      baseRiskReduction = 75.0;
      break;
    case 'Contour Trenching':
      baseNdviDelta = 0.08;
      baseMoistureEnhancement = 16.5;
      baseBenefitedHa = 35.0;
      baseRiskReduction = 60.0;
      break;
  }

  // Age maturation curve: structures take 1-3 years to establish groundwater recharge/vegetation
  const maturationFactor = Math.min(1.2, 0.6 + (ageYears * 0.15));

  const ndviChange = Math.round(baseNdviDelta * compFactor * maturationFactor * 1000) / 1000;
  const soilMoistureEnhancementPct = Math.round(baseMoistureEnhancement * compFactor * maturationFactor * 10) / 10;
  const wetnessChange = Math.round((ndviChange * 0.6) * 1000) / 1000;
  const benefitedAreaHa = Math.round(baseBenefitedHa * compFactor * maturationFactor * 10) / 10;
  const riskReductionPct = Math.round(baseRiskReduction * compFactor * maturationFactor * 10) / 10;

  // Multi-indicator effectiveness score (0–100)
  // 30% NDVI change normalized + 30% Soil moisture enhancement + 20% Benefited area + 20% Risk reduction
  const ndviNorm = Math.min(100, (ndviChange / 0.20) * 100);
  const moistureNorm = Math.min(100, (soilMoistureEnhancementPct / 25) * 100);
  const areaNorm = Math.min(100, (benefitedAreaHa / 50) * 100);
  const riskNorm = Math.min(100, (riskReductionPct / 80) * 100);

  const effectivenessScore = Math.round(
    0.30 * ndviNorm +
    0.30 * moistureNorm +
    0.20 * areaNorm +
    0.20 * riskNorm
  );

  let confidence: 'High' | 'Medium' | 'Low' = 'High';
  if (project.status === 'Delayed' || compFactor < 0.5) {
    confidence = 'Low';
  } else if (compFactor < 0.8 || ageYears < 1) {
    confidence = 'Medium';
  }

  return {
    projectId: project.id,
    name: project.name,
    type: project.type,
    watershedId: project.watershed_id,
    district: project.district,
    lat: project.lat,
    lng: project.lng,
    ndviChange,
    soilMoistureEnhancementPct,
    wetnessChange,
    benefitedAreaHa,
    riskReductionPct,
    effectivenessScore: Math.max(0, Math.min(100, effectivenessScore)),
    confidence,
    assessmentDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Computes aggregated effectiveness ranking by intervention type.
 */
export function computeInterventionRankings(
  assessments: InterventionAssessment[]
): InterventionRankingItem[] {
  const groups = new Map<string, InterventionAssessment[]>();

  for (const item of assessments) {
    const list = groups.get(item.type) || [];
    list.push(item);
    groups.set(item.type, list);
  }

  const rankings: InterventionRankingItem[] = [];

  for (const [type, items] of groups.entries()) {
    const count = items.length;
    const avgScore = items.reduce((sum, i) => sum + i.effectivenessScore, 0) / count;
    const avgArea = items.reduce((sum, i) => sum + i.benefitedAreaHa, 0) / count;

    // Confidence is High if count >= 3 and average score is well-established
    let conf: 'High' | 'Medium' | 'Low' = 'Medium';
    if (count >= 3 && items.every(i => i.confidence !== 'Low')) {
      conf = 'High';
    } else if (count < 2 || items.some(i => i.confidence === 'Low')) {
      conf = 'Low';
    }

    rankings.push({
      type,
      count,
      averageEffectiveness: Math.round(avgScore * 10) / 10,
      averageBenefitedAreaHa: Math.round(avgArea * 10) / 10,
      confidence: conf,
    });
  }

  // Sort descending by average effectiveness
  return rankings.sort((a, b) => b.averageEffectiveness - a.averageEffectiveness);
}
