import React, { useEffect, useState, useMemo } from 'react';
import { getProjects } from '../services/projectService';
import { getWatersheds } from '../services/watershedService';
import { assessIntervention, computeInterventionRankings } from '../utils/interventionScoring';
import type { Project, WatershedFeature, InterventionAssessment, InterventionRankingItem, ProjectType } from '../types';
import {
  Award, Filter, TrendingUp, CheckCircle, AlertTriangle, ShieldCheck,
  Building2, Droplets, Sprout, ArrowUpDown, ChevronRight, Info,
} from 'lucide-react';

const INTERVENTION_TYPES: ProjectType[] = ['Check Dam', 'Farm Pond', 'Afforestation', 'Contour Trenching'];

const InterventionAssessmentPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [selectedWatershed, setSelectedWatershed] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'effectiveness' | 'area' | 'name'>('effectiveness');

  useEffect(() => {
    Promise.all([getProjects(), getWatersheds()]).then(([pList, wList]) => {
      setProjects(pList);
      setWatersheds(wList);
      setLoading(false);
    });
  }, []);

  // Unique districts
  const districts = useMemo(() => {
    const set = new Set(watersheds.map(w => w.properties.district));
    return Array.from(set).sort();
  }, [watersheds]);

  // Filtered watersheds based on selected district
  const filteredWatersheds = useMemo(() => {
    if (selectedDistrict === 'all') return watersheds;
    return watersheds.filter(w => w.properties.district === selectedDistrict);
  }, [watersheds, selectedDistrict]);

  // Compute assessments for all projects
  const allAssessments = useMemo(() => {
    return projects.map(assessIntervention);
  }, [projects]);

  // Filtered assessments
  const filteredAssessments = useMemo(() => {
    return allAssessments.filter(item => {
      if (selectedDistrict !== 'all' && item.district !== selectedDistrict) return false;
      if (selectedWatershed !== 'all' && item.watershedId !== selectedWatershed) return false;
      if (selectedType !== 'all' && item.type !== selectedType) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === 'effectiveness') return b.effectivenessScore - a.effectivenessScore;
      if (sortBy === 'area') return b.benefitedAreaHa - a.benefitedAreaHa;
      return a.name.localeCompare(b.name);
    });
  }, [allAssessments, selectedDistrict, selectedWatershed, selectedType, sortBy]);

  // Rankings grouped by type
  const rankings = useMemo(() => {
    return computeInterventionRankings(filteredAssessments);
  }, [filteredAssessments]);

  // Overall watershed impact summary
  const summaryStats = useMemo(() => {
    if (filteredAssessments.length === 0) return { avgScore: 0, totalArea: 0, avgNdvi: 0, avgMoisture: 0 };
    const count = filteredAssessments.length;
    const avgScore = Math.round(filteredAssessments.reduce((s, i) => s + i.effectivenessScore, 0) / count);
    const totalArea = Math.round(filteredAssessments.reduce((s, i) => s + i.benefitedAreaHa, 0));
    const avgNdvi = Math.round((filteredAssessments.reduce((s, i) => s + i.ndviChange, 0) / count) * 1000) / 1000;
    const avgMoisture = Math.round((filteredAssessments.reduce((s, i) => s + i.soilMoistureEnhancementPct, 0) / count) * 10) / 10;
    return { avgScore, totalArea, avgNdvi, avgMoisture };
  }, [filteredAssessments]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-6 h-6 text-primary-600" />
            <h1 className="text-xl font-bold text-text-dark">Intervention Impact Assessment &amp; Ranking</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Empirical evaluation of soil-and-water conservation structures using measurable environmental &amp; agricultural indicators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-primary-50 text-primary-700 px-3 py-1.5 rounded-full border border-primary-200 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-primary-600" /> SIH26015 Analytical Engine
          </span>
        </div>
      </div>

      {/* Scientific Transparency Notice */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-3.5 flex items-start gap-3">
        <Info className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-primary-800 leading-relaxed">
          <span className="font-semibold">Methodology Transparency:</span>{' '}
Effectiveness scores are dynamically synthesized from measured canopy greening (ΔNDVI), Sentinel-1 radar surface moisture enhancement (ΔSSMI), catchment benefited area, and hydrological risk mitigation. No fixed scores are hardcoded.
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average Effectiveness</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-text-dark">{summaryStats.avgScore}</span>
            <span className="text-xs text-gray-400">/ 100</span>
          </div>
          <p className="text-[11px] text-tertiary-600 mt-1 font-medium">Across {filteredAssessments.length} audited works</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Benefited Area</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-text-dark">{summaryStats.totalArea}</span>
            <span className="text-xs text-gray-400">Hectares</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Catchment command area</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Canopy Delta (ΔNDVI)</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-tertiary-600">+{summaryStats.avgNdvi}</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Post-intervention greening</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Soil Moisture Boost</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-primary-600">+{summaryStats.avgMoisture}%</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Relative radar SSMI index</p>
        </div>
      </div>

      {/* Effectiveness Ranking by Structure Type */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-sm font-bold text-text-dark uppercase tracking-wider flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" /> Structure Type Effectiveness Ranking
          </h2>
          <span className="text-xs text-gray-400">Aggregated from registered field interventions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Intervention Type</th>
                <th className="py-2.5 px-3 text-center">Audited Count</th>
                <th className="py-2.5 px-3 text-center">Avg Effectiveness Score</th>
                <th className="py-2.5 px-3 text-center">Avg Benefited Area</th>
                <th className="py-2.5 px-3 text-center">Scientific Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rankings.map((rank, idx) => (
                <tr key={rank.type} className="hover:bg-gray-50/80 transition-colors">
                  <td className="py-3 px-3 font-bold text-gray-700">
                    <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs ${
                      idx === 0 ? 'bg-amber-100 text-amber-800' :
                      idx === 1 ? 'bg-gray-200 text-gray-800' :
                      idx === 2 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      #{idx + 1}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-semibold text-text-dark flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    {rank.type}
                  </td>
                  <td className="py-3 px-3 text-center text-gray-600 font-medium">
                    {rank.count}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-tertiary-500 h-2 rounded-full"
                          style={{ width: `${rank.averageEffectiveness}%` }}
                        />
                      </div>
                      <span className="font-bold text-text-dark text-xs">{rank.averageEffectiveness}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-700 font-medium">
                    {rank.averageBenefitedAreaHa} ha
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      rank.confidence === 'High' ? 'bg-emerald-100 text-emerald-800' :
                      rank.confidence === 'Medium' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {rank.confidence} Confidence
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-tier Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <Filter className="w-3.5 h-3.5" /> Filter by:
          </div>

          {/* District Selector */}
          <select
            value={selectedDistrict}
            onChange={e => { setSelectedDistrict(e.target.value); setSelectedWatershed('all'); }}
            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700 font-medium shadow-sm focus:outline-none"
          >
            <option value="all">All Districts</option>
            {districts.map(d => (
              <option key={d} value={d}>{d} District</option>
            ))}
          </select>

          {/* Watershed Selector */}
          <select
            value={selectedWatershed}
            onChange={e => setSelectedWatershed(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700 font-medium shadow-sm focus:outline-none"
          >
            <option value="all">All Watersheds</option>
            {filteredWatersheds.map(w => (
              <option key={w.properties.id} value={w.properties.id}>
                {w.properties.name}
              </option>
            ))}
          </select>

          {/* Type Selector */}
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-gray-700 font-medium shadow-sm focus:outline-none"
          >
            <option value="all">All Intervention Types</option>
            {INTERVENTION_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 font-medium shadow-sm focus:outline-none"
          >
            <option value="effectiveness">Effectiveness Score</option>
            <option value="area">Benefited Area</option>
            <option value="name">Structure Name</option>
          </select>
        </div>
      </div>

      {/* Individual Intervention Assessment Records */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Individual Intervention Records ({filteredAssessments.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssessments.map(item => (
            <div key={item.projectId} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm space-y-3 hover:border-primary-300 transition-colors">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-text-dark">{item.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.type} • {item.district} District
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-tertiary-700">
                    {item.effectivenessScore} <span className="text-xs text-gray-400 font-normal">/ 100</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    item.confidence === 'High' ? 'bg-emerald-100 text-emerald-800' :
                    item.confidence === 'Medium' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {item.confidence} Confidence
                  </span>
                </div>
              </div>

              {/* Indicator metrics grid */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-100 text-center">
                <div className="bg-gray-50 rounded p-1.5">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">ΔNDVI</span>
                  <span className="text-xs font-bold text-tertiary-600">+{item.ndviChange}</span>
                </div>
                <div className="bg-gray-50 rounded p-1.5">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">ΔSSMI</span>
                  <span className="text-xs font-bold text-primary-600">+{item.soilMoistureEnhancementPct}%</span>
                </div>
                <div className="bg-gray-50 rounded p-1.5">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">Command</span>
                  <span className="text-xs font-bold text-gray-700">{item.benefitedAreaHa} ha</span>
                </div>
                <div className="bg-gray-50 rounded p-1.5">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold block">Risk Red.</span>
                  <span className="text-xs font-bold text-emerald-600">{item.riskReductionPct}%</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                <span>Coord: {item.lat.toFixed(4)}° N, {item.lng.toFixed(4)}° E</span>
                <span>Evaluated: {item.assessmentDate}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InterventionAssessmentPage;
