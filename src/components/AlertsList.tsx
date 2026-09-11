import React, { useState } from 'react';
import type { MaintenanceAlert } from '../types';
import { AlertTriangle, AlertCircle, Info, ChevronRight, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

const severityConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-700',
    icon: AlertCircle,
    iconColor: 'text-red-500',
    label: 'Critical',
  },
  high: {
    bg: 'bg-accent-50',
    border: 'border-accent-200',
    text: 'text-accent-700',
    badge: 'bg-accent-100 text-accent-700',
    icon: AlertTriangle,
    iconColor: 'text-accent-500',
    label: 'High',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    badge: 'bg-yellow-100 text-yellow-700',
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    label: 'Medium',
  },
  low: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-700',
    icon: Info,
    iconColor: 'text-blue-400',
    label: 'Low',
  },
};

interface AlertsListProps {
  alerts: MaintenanceAlert[];
  limit?: number;
}

const AlertsList: React.FC<AlertsListProps> = ({ alerts, limit }) => {
  const displayed = limit ? alerts.slice(0, limit) : alerts;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (displayed.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No active alerts
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((alert) => {
        const cfg = severityConfig[alert.severity];
        const Icon = cfg.icon;
        const isExpanded = expandedId === alert.id;
        return (
          <div
            key={alert.id}
            className={`rounded-lg border ${cfg.bg} ${cfg.border} overflow-hidden`}
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : alert.id)}
              className="w-full p-3 flex items-start gap-3 text-left"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-gray-500">{alert.reason}</span>
                  {alert.thresholdDays !== undefined && alert.actualDays !== undefined && (
                    <span className="text-xs text-gray-400">
                      · {alert.actualDays}d / {alert.thresholdDays}d threshold
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-dark leading-snug">{alert.message}</p>
              </div>
              {isExpanded
                ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
            </button>

            {isExpanded && (
              <div className={`px-3 pb-3 pt-0 border-t ${cfg.border}`}>
                {alert.detail && (
                  <p className="text-xs text-gray-600 leading-relaxed mt-2">{alert.detail}</p>
                )}
                <Link
                  to={`/project/${alert.project_id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 mt-2"
                >
                  View full project <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AlertsList;
