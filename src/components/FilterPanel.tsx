import React from 'react';
import { useFilterStore } from '../store/filterStore';
import type { ProjectType, ProjectStatus } from '../types';
import { Filter, X } from 'lucide-react';

interface FilterPanelProps {
  watersheds: { id: string; name: string; district: string }[];
}

const STATUSES: ProjectStatus[] = ['Completed', 'Ongoing', 'Delayed'];
const TYPES: ProjectType[] = ['Check Dam', 'Farm Pond', 'Afforestation', 'Contour Trenching'];

const FilterPanel: React.FC<FilterPanelProps> = ({ watersheds }) => {
  const {
    district, setDistrict,
    watershedId, setWatershedId,
    status, setStatus,
    projectType, setProjectType,
    searchQuery, setSearchQuery,
    resetFilters,
  } = useFilterStore();

  const districts = [...new Set(watersheds.map(w => w.district))].sort();
  const hasFilters = district || watershedId || status || projectType || searchQuery;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
            <Filter className="w-3.5 h-3.5 text-primary-600" />
          </div>
          <span className="text-sm font-semibold text-text-dark">Filters</span>
        </div>
        {hasFilters && (
          <button
            onClick={resetFilters}
            className="text-xs text-accent-600 hover:text-accent-800 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Search</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Intervention or watershed name..."
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          />
        </div>

        {/* District */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">District</label>
          <select
            value={district}
            onChange={e => setDistrict(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          >
            <option value="">All Districts</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Watershed */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Watershed</label>
          <select
            value={watershedId}
            onChange={e => setWatershedId(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          >
            <option value="">All Watersheds</option>
            {watersheds.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as ProjectStatus | '')}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Intervention Type</label>
          <select
            value={projectType}
            onChange={e => setProjectType(e.target.value as ProjectType | '')}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          >
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;
