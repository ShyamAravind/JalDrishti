import React, { useEffect, useState, useMemo } from 'react';
import { getAlerts } from '../services/alertService';
import { getProjects } from '../services/projectService';
import type { MaintenanceAlert, AlertSeverity, AlertReason } from '../types';
import { Link } from 'react-router-dom';
import { Bell, Search, AlertCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const SEVERITIES: AlertSeverity[] = ['critical', 'high', 'medium', 'low'];
const REASONS: AlertReason[] = [
  'Inspection overdue',
  'Missing recent evidence',
  'Structure aging',
  'Spatial risk indicator',
];

const severityColors = {
  critical: 'text-red-700 bg-red-50 border-red-200 icon-red',
  high:     'text-accent-700 bg-accent-50 border-accent-200 icon-accent',
  medium:   'text-yellow-700 bg-yellow-50 border-yellow-200 icon-yellow',
  low:      'text-blue-700 bg-blue-50 border-blue-200 icon-blue',
};

const AlertsPage: React.FC = () => {
  const officer = useAuthStore(s => s.officer);
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | ''>('');
  const [filterReason, setFilterReason] = useState<AlertReason | ''>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAlerts(), getProjects()]).then(([allAlerts, allProjects]) => {
      // District-scoped access: officers only see alerts tied to projects in
      // their assigned district. The admin account sees everything.
      if (officer && !officer.isAdmin) {
        const districtProjectIds = new Set(
          allProjects.filter(p => p.district === officer.district).map(p => p.id)
        );
        setAlerts(allAlerts.filter(a => districtProjectIds.has(a.project_id)));
      } else {
        setAlerts(allAlerts);
      }
    });
  }, [officer]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const matchSeverity = filterSeverity ? alert.severity === filterSeverity : true;
      const matchReason = filterReason ? alert.reason === filterReason : true;
      const matchSearch = searchQuery
        ? alert.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          alert.project_id.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      return matchSeverity && matchReason && matchSearch;
    });
  }, [alerts, filterSeverity, filterReason, searchQuery]);

  const stats = useMemo(() => {
    const total = filteredAlerts.length;
    const critical = filteredAlerts.filter(a => a.severity === 'critical').length;
    const high = filteredAlerts.filter(a => a.severity === 'high').length;
    const medium = filteredAlerts.filter(a => a.severity === 'medium').length;
    const low = filteredAlerts.filter(a => a.severity === 'low').length;
    return { total, critical, high, medium, low };
  }, [filteredAlerts]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-text-dark flex items-center gap-2">
          <Bell className="w-5 h-5 text-accent-500" />
          Maintenance Alerts &amp; Auditing
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Review structural anomalies, overdue inspections, and potential location mismatches.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Total Filtered</p>
          <p className="text-2xl font-bold text-text-dark">{stats.total}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center shadow-sm text-red-700">
          <p className="text-xs text-red-600 font-semibold uppercase tracking-wider mb-1">Critical</p>
          <p className="text-2xl font-bold">{stats.critical}</p>
        </div>
        <div className="bg-accent-50 border border-accent-200 rounded-lg p-4 text-center shadow-sm text-accent-700">
          <p className="text-xs text-accent-600 font-semibold uppercase tracking-wider mb-1">High Severity</p>
          <p className="text-2xl font-bold">{stats.high}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center shadow-sm text-yellow-700">
          <p className="text-xs text-yellow-600 font-semibold uppercase tracking-wider mb-1">Medium Severity</p>
          <p className="text-2xl font-bold">{stats.medium}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center shadow-sm text-blue-700">
          <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider mb-1">Low Severity</p>
          <p className="text-2xl font-bold">{stats.low}</p>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        {/* Search */}
        <div className="flex-1 w-full">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Search Alerts</label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by details or project ID..."
              className="w-full text-sm border border-gray-200 rounded pl-9 pr-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Severity */}
        <div className="w-full md:w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Severity</label>
          <select
            value={filterSeverity}
            onChange={e => setFilterSeverity(e.target.value as AlertSeverity | '')}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          >
            <option value="">All Severities</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Reason */}
        <div className="w-full md:w-64">
          <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Reason</label>
          <select
            value={filterReason}
            onChange={e => setFilterReason(e.target.value as AlertReason | '')}
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:border-primary-400 bg-surface-card"
          >
            <option value="">All Reasons</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-surface-card text-xs text-gray-500 uppercase tracking-wider text-left">
                <th className="py-3 px-4 font-semibold w-28">Severity</th>
                <th className="py-3 px-4 font-semibold w-48">Audit Category</th>
                <th className="py-3 px-4 font-semibold">Incident Details</th>
                <th className="py-3 px-4 font-semibold text-center w-36">Days Since Inspection</th>
                <th className="py-3 px-4 font-semibold w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 font-medium">
                    No active alerts matching the criteria
                  </td>
                </tr>
              ) : (
                filteredAlerts.map(alert => {
                  const colorClass = severityColors[alert.severity];
                  const Icon = alert.severity === 'critical' ? AlertCircle : alert.severity === 'high' ? AlertTriangle : Info;
                  const isExpanded = expandedId === alert.id;
                  return (
                    <React.Fragment key={alert.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                      className="hover:bg-surface-card transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${colorClass}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {alert.severity}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-text-dark">
                        {alert.reason}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        {alert.message}
                        {alert.thresholdDays !== undefined && alert.actualDays !== undefined && (
                          <span className="text-xs text-gray-400 ml-2">
                            ({alert.actualDays}d vs {alert.thresholdDays}d threshold)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-medium text-text-dark">
                        {alert.days_since_last_inspection}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/project/${alert.project_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-primary-600 hover:text-primary-800 p-1 block rounded"
                          title="View project detail page"
                        >
                          <ChevronRight className={`w-5 h-5 ml-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </Link>
                      </td>
                    </tr>
                    {isExpanded && alert.detail && (
                      <tr className="bg-surface-card">
                        <td colSpan={5} className="px-4 pb-4 pt-1">
                          <div className="border-l-2 border-primary-300 pl-3 text-sm text-gray-600 leading-relaxed">
                            {alert.detail}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AlertsPage;
