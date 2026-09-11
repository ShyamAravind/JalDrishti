import type { MaintenanceAlert } from '../types';
import { getProjects } from './projectService';
import { getGeoEvidence } from './evidenceService';
import { computeLiveAlerts } from '../utils/alertLogic';

// Alerts are now computed live from real project data (inspection dates,
// structure age, evidence trust scores) rather than read from a static mock
// file — see utils/alertLogic.ts for the actual rule logic.

export async function getAlerts(): Promise<MaintenanceAlert[]> {
  const [projects, evidence] = await Promise.all([getProjects(), getGeoEvidence()]);
  return computeLiveAlerts(projects, evidence);
}

export async function getAlertsByProject(projectId: string): Promise<MaintenanceAlert[]> {
  const all = await getAlerts();
  return all.filter(a => a.project_id === projectId);
}

export async function getAlertsBySeverity(severity: string): Promise<MaintenanceAlert[]> {
  const all = await getAlerts();
  return all.filter(a => a.severity === severity);
}
