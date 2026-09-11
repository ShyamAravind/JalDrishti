import type { Project } from '../types';
import projectsData from '../data/projects.json';

const projects = projectsData as Project[];

export async function getProjects(): Promise<Project[]> {
  return projects;
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  return projects.find(p => p.id === id);
}

export async function getProjectsByWatershed(watershedId: string): Promise<Project[]> {
  return projects.filter(p => p.watershed_id === watershedId);
}

export async function getProjectsByDistrict(district: string): Promise<Project[]> {
  return projects.filter(p => p.district === district);
}
