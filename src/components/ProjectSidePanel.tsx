import React, { useEffect, useState } from 'react';
import { X, Calendar, Activity, MapPin, ClipboardList } from 'lucide-react';
import type { Project, GeoEvidence } from '../types';
import BeforeAfterSlider from './BeforeAfterSlider';
import TrustScoreBadge from './TrustScoreBadge';
import InspectionScoreBadge from './InspectionScoreBadge';

interface ProjectSidePanelProps {
  project: Project | null;
  evidence: GeoEvidence | null;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  Completed: 'bg-tertiary-100 text-tertiary-700 border-tertiary-200',
  Ongoing:   'bg-primary-100 text-primary-700 border-primary-200',
  Delayed:   'bg-accent-100 text-accent-700 border-accent-200',
};

const ProjectSidePanel: React.FC<ProjectSidePanelProps> = ({ project, evidence, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (project) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [project]);

  if (!project) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'fixed right-0 top-0 bottom-0 w-[420px] max-w-full bg-white shadow-2xl z-50',
          'flex flex-col overflow-hidden transition-transform duration-300',
          visible ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="bg-primary-600 text-white px-5 py-4 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="text-xs text-primary-200 uppercase tracking-wide font-medium">{project.type}</p>
            <h2 className="text-base font-bold leading-tight mt-0.5">{project.name}</h2>
            <div className="flex items-center gap-3 mt-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColors[project.status]}`}>
                {project.status}
              </span>
              <span className="text-xs text-primary-200">{project.district}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-primary-700 hover:bg-primary-800 flex items-center justify-center flex-shrink-0 ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Completion */}
          <div className="bg-surface-card rounded-lg p-3 border border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-semibold text-text-dark">Completion</span>
              </div>
              <span className="text-sm font-bold text-primary-700">{project.completion_pct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  project.status === 'Completed' ? 'bg-tertiary-500' :
                  project.status === 'Delayed'   ? 'bg-accent-500' : 'bg-primary-500'
                }`}
                style={{ width: `${project.completion_pct}%` }}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-card rounded p-2 border border-gray-200">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-0.5">
                <Calendar className="w-3 h-3" /> Start Date
              </div>
              <span className="text-sm font-medium text-text-dark">{project.start_date}</span>
            </div>
            <div className="bg-surface-card rounded p-2 border border-gray-200">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-0.5">
                <Calendar className="w-3 h-3" /> Last Inspection
              </div>
              <span className="text-sm font-medium text-text-dark">{project.last_inspection_date}</span>
            </div>
          </div>

          {/* Coordinates */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-surface-card rounded p-2 border border-gray-200">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{project.lat.toFixed(4)}°N, {project.lng.toFixed(4)}°E &nbsp;|&nbsp; Age: {project.structure_age_years} yr(s)</span>
          </div>

          {/* Before/After Photo Slider */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photo Comparison (drag to reveal)</p>
            <BeforeAfterSlider
              beforeUrl={project.photos.before.url}
              afterUrl={project.photos.after.url}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{project.photos.before.timestamp.slice(0, 10)}</span>
              <span>{project.photos.after.timestamp.slice(0, 10)}</span>
            </div>
          </div>

          {/* Trust Score */}
          {evidence && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Geo-Evidence Trust</p>
              <TrustScoreBadge evidence={evidence} />
            </div>
          )}

          {/* Structural Health / Inspection Score — distinct from evidence trust */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Structural Condition</p>
            <InspectionScoreBadge project={project} />
          </div>

          {/* Inspection History */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="w-4 h-4 text-secondary-500" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inspection History</p>
            </div>
            <div className="space-y-2">
              {[...project.inspection_history].reverse().map((entry, i) => (
                <div key={i} className="flex gap-3 text-xs">
                  <span className="text-gray-400 whitespace-nowrap flex-shrink-0">{entry.date}</span>
                  <span className="text-text-dark">{entry.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ProjectSidePanel;
