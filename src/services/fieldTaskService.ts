import tasksData from '../data/fieldTasks.json';

export interface FieldTask {
  id: string;
  officerId: string;
  projectId: string;
  projectName: string;
  description: string;
  dueLabel: string;
  priority: 'high' | 'medium' | 'low';
}

const tasks = tasksData as FieldTask[];

export async function getAssignedTasks(officerId: string): Promise<FieldTask[]> {
  return tasks.filter(t => t.officerId === officerId);
}