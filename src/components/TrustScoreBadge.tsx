import React from 'react';
import { CheckCircle, XCircle, Star } from 'lucide-react';
import type { GeoEvidence } from '../types';

interface TrustScoreBadgeProps {
  evidence: GeoEvidence;
  compact?: boolean;
}

const checks = [
  { key: 'gps_check',       label: 'GPS Location' },
  { key: 'timestamp_check', label: 'Timestamp' },
  { key: 'metadata_check',  label: 'Metadata' },
  { key: 'duplicate_check', label: 'Duplicate Check' },
] as const;

const TrustScoreBadge: React.FC<TrustScoreBadgeProps> = ({ evidence, compact = false }) => {
  const { trust_score } = evidence;

  const scoreColor =
    trust_score >= 4 ? 'text-tertiary-600' :
    trust_score === 3 ? 'text-primary-500' :
    trust_score === 2 ? 'text-accent-500' :
    'text-red-600';

  const bgColor =
    trust_score >= 4 ? 'bg-tertiary-50 border-tertiary-200' :
    trust_score === 3 ? 'bg-primary-50 border-primary-200' :
    trust_score === 2 ? 'bg-accent-50 border-accent-200' :
    'bg-red-50 border-red-200';

  const label =
    trust_score >= 5 ? 'High Trust' :
    trust_score === 4 ? 'Good' :
    trust_score === 3 ? 'Moderate' :
    trust_score === 2 ? 'Low Trust' :
    'Unverified';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${bgColor} ${scoreColor}`}>
        <Star className="w-3 h-3" />
        {trust_score}/5 — {label}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${bgColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${bgColor}`}>
          <Star className={`w-5 h-5 ${scoreColor}`} />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Geo-Evidence Trust</p>
          <p className={`text-lg font-bold leading-none ${scoreColor}`}>{trust_score}/5 — {label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mt-2">
        {checks.map(({ key, label: clabel }) => {
          const passed = evidence[key] === 'pass';
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              {passed
                ? <CheckCircle className="w-3.5 h-3.5 text-tertiary-500 flex-shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              }
              <span className={passed ? 'text-gray-600' : 'text-red-600 font-medium'}>{clabel}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 pt-2 border-t border-current/10 text-xs text-gray-500">
        Location offset: <span className={`font-semibold ${evidence.distance_from_registered_location_m > 200 ? 'text-accent-600' : 'text-gray-600'}`}>
          {evidence.distance_from_registered_location_m} m
        </span> from registered site
      </div>
    </div>
  );
};

export default TrustScoreBadge;
