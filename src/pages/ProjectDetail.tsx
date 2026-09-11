import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProjectById } from '../services/projectService';
import { getEvidenceByProject } from '../services/evidenceService';
import type { Project, GeoEvidence } from '../types';
import BeforeAfterSlider from '../components/BeforeAfterSlider';
import TrustScoreBadge from '../components/TrustScoreBadge';
import InspectionScoreBadge from '../components/InspectionScoreBadge';
import {
  ArrowLeft, Calendar, Activity, MapPin, ClipboardList,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  Completed: 'bg-tertiary-100 text-tertiary-700 border-tertiary-200',
  Ongoing:   'bg-primary-100 text-primary-700 border-primary-200',
  Delayed:   'bg-accent-100 text-accent-700 border-accent-200',
};

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [evidence, setEvidence] = useState<GeoEvidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      getProjectById(id),
      getEvidenceByProject(id),
    ]).then(([p, e]) => {
      setProject(p ?? null);
      setEvidence(e ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-12 text-gray-500 font-medium">
        Loading project details...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4 text-center py-12">
        <p className="text-gray-500 font-bold text-lg">Project not found</p>
        <Link
          to="/map"
          className="inline-flex items-center gap-1.5 text-primary-600 hover:underline font-semibold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Map
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <div>
        <Link
          to="/map"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 uppercase tracking-wide"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Map View
        </Link>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-primary-600 text-white px-6 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <span className="text-xs uppercase font-semibold text-primary-200 tracking-wider">{project.type}</span>
            <h1 className="text-xl font-bold mt-0.5">{project.name}</h1>
            <div className="flex items-center gap-3 mt-2 text-xs text-primary-200">
              <span className="font-semibold">ID: {project.id}</span>
              <span>|</span>
              <span>District: {project.district}</span>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusColors[project.status]}`}>
            {project.status}
          </span>
        </div>

        {/* Content body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Slider & Trust badge */}
          <div className="space-y-5">
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Before / After Evidence Slider</h2>
              <BeforeAfterSlider
                beforeUrl={project.photos.before.url}
                afterUrl={project.photos.after.url}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>Before photo: {project.photos.before.timestamp.slice(0, 10)}</span>
                <span>After photo: {project.photos.after.timestamp.slice(0, 10)}</span>
              </div>
            </div>

            {evidence && (
              <div>
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Audit Integrity Checks</h2>
                <TrustScoreBadge evidence={evidence} />
              </div>
            )}

            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Structural Condition</h2>
              <InspectionScoreBadge project={project} />
            </div>
          </div>

          {/* Right Column: Details & History */}
          <div className="space-y-5">
            {/* Completion pct */}
            <div className="bg-surface-card rounded-lg p-4 border border-gray-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-text-dark uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-primary-600" />
                  Structure Completion
                </span>
                <span className="font-black text-sm text-primary-700">{project.completion_pct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    project.status === 'Completed' ? 'bg-tertiary-500' :
                    project.status === 'Delayed'   ? 'bg-accent-500' : 'bg-primary-500'
                  }`}
                  style={{ width: `${project.completion_pct}%` }}
                />
              </div>
            </div>

            {/* Timestamps / Age */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-card rounded p-3 border border-gray-200">
                <span className="block text-[10px] text-gray-400 uppercase font-semibold">Start Date</span>
                <span className="text-sm font-bold text-text-dark flex items-center gap-1.5 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {project.start_date}
                </span>
              </div>
              <div className="bg-surface-card rounded p-3 border border-gray-200">
                <span className="block text-[10px] text-gray-400 uppercase font-semibold">Last Inspected</span>
                <span className="text-sm font-bold text-text-dark flex items-center gap-1.5 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  {project.last_inspection_date}
                </span>
              </div>
            </div>

            {/* GPS Metadata */}
            <div className="bg-surface-card rounded-lg p-3 border border-gray-200 flex items-start gap-2 text-xs text-gray-600">
              <MapPin className="w-4 h-4 text-secondary-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-text-dark">Registered Coordinates</p>
                <p className="mt-0.5">{project.lat.toFixed(6)}°N, {project.lng.toFixed(6)}°E</p>
                <p className="text-[10px] text-gray-400 mt-1">Structure operational age: {project.structure_age_years} years</p>
              </div>
            </div>

            {/* Full Inspection Log */}
            <div className="space-y-2">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-secondary-500" />
                Comprehensive Audit History
              </h2>
              <div className="border border-gray-100 rounded-lg p-3 space-y-3 bg-surface-card/30">
                {[...project.inspection_history].reverse().map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <span className="text-[10px] text-gray-400 font-semibold bg-gray-100 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                      {entry.date}
                    </span>
                    <p className="text-gray-600 leading-snug">{entry.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailPage;
