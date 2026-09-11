import React from 'react';
import { CheckCircle, XCircle, Wrench } from 'lucide-react';
import type { Project } from '../types';
import { computeStructuralHealth } from '../utils/structuralHealth';

interface InspectionScoreBadgeProps {
  project: Project;
  compact?: boolean;
}

const checkLabels = [
  { key: 'recentlyInspected',        label: 'Recently Inspected' },
  { key: 'noReportedDamage',         label: 'No Reported Damage' },
  { key: 'withinServiceLife',        label: 'Within Service Life' },
  { key: 'regularInspectionHistory', label: 'Regular Inspection Log' },
] as const;

const InspectionScoreBadge: React.FC<InspectionScoreBadgeProps> = ({ project, compact = false }) => {
  const health = computeStructuralHealth(project);
  const { score, rating, checks, flaggedNotes, daysSinceInspection } = health;

  const scoreColor =
    rating === 'Excellent' ? 'text-tertiary-600' :
    rating === 'Good'      ? 'text-primary-500' :
    rating === 'Fair'      ? 'text-accent-500' :
    'text-red-600';

  const bgColor =
    rating === 'Excellent' ? 'bg-tertiary-50 border-tertiary-200' :
    rating === 'Good'      ? 'bg-primary-50 border-primary-200' :
    rating === 'Fair'      ? 'bg-accent-50 border-accent-200' :
    'bg-red-50 border-red-200';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${bgColor} ${scoreColor}`}>
        <Wrench className="w-3 h-3" />
        {score}/100 — {rating}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${bgColor}`}>
          <Wrench className={`w-5 h-5 ${scoreColor}`} />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Structural Health (Inspection Score)</p>
          <p className={`text-lg font-bold leading-none ${scoreColor}`}>{score}/100 — {rating}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mt-2">
        {checkLabels.map(({ key, label }) => {
          const passed = checks[key];
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              {passed
                ? <CheckCircle className="w-3.5 h-3.5 text-tertiary-500 flex-shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              }
              <span className={passed ? 'text-gray-600' : 'text-red-600 font-medium'}>{label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-current/10 text-xs text-gray-500">
        Last inspected <span className="font-semibold text-gray-600">{daysSinceInspection} days ago</span>
      </div>

      {flaggedNotes.length > 0 && (
        <div className="mt-1.5 text-xs text-red-600">
          <span className="font-semibold">Flagged note:</span> "{flaggedNotes[flaggedNotes.length - 1]}"
        </div>
      )}
    </div>
  );
};

export default InspectionScoreBadge;
