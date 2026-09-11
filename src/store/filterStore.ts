import { create } from 'zustand';
import type { ProjectType, ProjectStatus } from '../types';

interface FilterState {
  // Filter values
  district: string;        // '' = all
  watershedId: string;     // '' = all
  status: ProjectStatus | '';
  projectType: ProjectType | '';
  searchQuery: string;

  // Selected project for side panel / detail view
  selectedProjectId: string | null;

  // Actions
  setDistrict: (v: string) => void;
  setWatershedId: (v: string) => void;
  setStatus: (v: ProjectStatus | '') => void;
  setProjectType: (v: ProjectType | '') => void;
  setSearchQuery: (v: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  resetFilters: () => void;
}

export const useFilterStore = create<FilterState>((set) => ({
  district: '',
  watershedId: '',
  status: '',
  projectType: '',
  searchQuery: '',
  selectedProjectId: null,

  setDistrict:         (v) => set({ district: v }),
  setWatershedId:      (v) => set({ watershedId: v }),
  setStatus:           (v) => set({ status: v }),
  setProjectType:      (v) => set({ projectType: v }),
  setSearchQuery:      (v) => set({ searchQuery: v }),
  setSelectedProjectId:(id) => set({ selectedProjectId: id }),
  resetFilters: () => set({
    district: '',
    watershedId: '',
    status: '',
    projectType: '',
    searchQuery: '',
    selectedProjectId: null,
  }),
}));
