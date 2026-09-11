import React, { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { LulcTrendEntry } from '../types';

interface LulcTrendChartProps {
  data: LulcTrendEntry;
  type?: 'area' | 'bar';
}

const COLORS = {
  forest:      '#6B8E4E',
  agricultural: '#C97B4A',
  water:       '#2C6E8E',
  barren:      '#8B6844',
};

const LulcTrendChart: React.FC<LulcTrendChartProps> = ({ data, type = 'area' }) => {
  const chartData = useMemo(() =>
    data.years.map((year, i) => ({
      year: year.toString(),
      'Forest': data.forest_pct[i],
      'Agricultural': data.agricultural_pct[i],
      'Water Bodies': data.water_bodies_pct[i],
      'Barren / Degraded': data.barren_degraded_pct[i],
    })),
    [data]
  );

  const commonProps = {
    data: chartData,
    margin: { top: 5, right: 10, left: 0, bottom: 5 },
  };

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
      <YAxis unit="%" tick={{ fontSize: 12 }} width={38} />
      <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      {type === 'area' ? (
        <AreaChart {...commonProps}>
          {axes}
          <Area type="monotone" dataKey="Forest"           stackId="1" stroke={COLORS.forest}      fill={COLORS.forest}      fillOpacity={0.7} />
          <Area type="monotone" dataKey="Agricultural"     stackId="1" stroke={COLORS.agricultural} fill={COLORS.agricultural} fillOpacity={0.7} />
          <Area type="monotone" dataKey="Water Bodies"     stackId="1" stroke={COLORS.water}       fill={COLORS.water}       fillOpacity={0.7} />
          <Area type="monotone" dataKey="Barren / Degraded" stackId="1" stroke={COLORS.barren}     fill={COLORS.barren}      fillOpacity={0.7} />
        </AreaChart>
      ) : (
        <BarChart {...commonProps}>
          {axes}
          <Bar dataKey="Forest"            stackId="a" fill={COLORS.forest}      />
          <Bar dataKey="Agricultural"      stackId="a" fill={COLORS.agricultural} />
          <Bar dataKey="Water Bodies"      stackId="a" fill={COLORS.water}       />
          <Bar dataKey="Barren / Degraded" stackId="a" fill={COLORS.barren}      radius={[3, 3, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
};

export default LulcTrendChart;
