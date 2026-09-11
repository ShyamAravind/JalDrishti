import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts';
import type { Project } from '../types';

interface StatusChartProps {
  projects: Project[];
}

const STATUS_COLORS = {
  Completed: '#6B8E4E',
  Ongoing:   '#2C6E8E',
  Delayed:   '#C97B4A',
};

const TYPE_COLORS = ['#2C6E8E', '#6B8E4E', '#8B6844', '#C97B4A'];

const StatusChart: React.FC<StatusChartProps> = ({ projects }) => {
  const byStatus = useMemo(() => {
    const counts: Record<string, number> = { Completed: 0, Ongoing: 0, Delayed: 0 };
    projects.forEach(p => { counts[p.status] = (counts[p.status] ?? 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [projects]);

  const byType = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => { counts[p.type] = (counts[p.type] ?? 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [projects]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* By Status */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Status</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byStatus} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Projects" radius={[4, 4, 0, 0]}>
              {byStatus.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] ?? '#8B6844'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By Type */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Intervention Type</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={byType} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="count" name="Interventions" radius={[4, 4, 0, 0]}>
              {byType.map((entry, index) => (
                <Cell key={entry.name} fill={TYPE_COLORS[index % TYPE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StatusChart;
