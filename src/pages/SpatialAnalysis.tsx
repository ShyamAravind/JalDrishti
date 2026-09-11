import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getWatersheds } from '../services/watershedService';
import { getLulcTrendByWatershed } from '../services/gisService';
import {
  
  getSentinel1SoilMoisture,
  getTemporalChange,
  getLandDegradation,
} from '../services/satelliteService';
import LulcTrendChart from '../components/LulcTrendChart';
import type {
  WatershedFeature,
  LulcTrendEntry,
  
  Sentinel1SoilMoistureResult,
  TemporalChangeResult,
  LandDegradationResult,
} from '../types';
import {
  TrendingUp, TrendingDown, Satellite, Loader2, AlertTriangle,
  Droplets, Waves, ShieldCheck, CheckCircle2,  Radio, Activity,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

interface LiveLulcResult {
  watershed_id: string;
  watershed_name?: string;
  year: number;
  forest_pct: number;
  agricultural_pct: number;
  water_bodies_pct: number;
  barren_degraded_pct: number;
  ndvi_mean?: number | null;
  moisture_proxy_ndwi: number | null;
  moisture_proxy_category: string;
  moisture_proxy_disclaimer: string;
  source: string;
  provider?: string;
  dataset?: string;
  computed_at: string;
}

const SpatialAnalysis: React.FC = () => {
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>('');
  const [trendData, setTrendData] = useState<LulcTrendEntry | null>(null);
  

  // ── Live Earth Engine LULC state ──────────────────────────────────────────
  const [liveResult, setLiveResult] = useState<LiveLulcResult | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // ── Sentinel-1 SAR Soil Moisture state ────────────────────────────────────
  const [smBeforeStart, setSmBeforeStart] = useState('2023-01-01');
  const [smBeforeEnd, setSmBeforeEnd] = useState('2023-06-30');
  const [smAfterStart, setSmAfterStart] = useState('2024-01-01');
  const [smAfterEnd, setSmAfterEnd] = useState('2024-06-30');
  const [soilMoistureResult, setSoilMoistureResult] = useState<Sentinel1SoilMoistureResult | null>(null);
  const [smLoading, setSmLoading] = useState(false);
  const [smError, setSmError] = useState<string | null>(null);

  // ── Temporal Change Detection state ──────────────────────────────────────
  const [changeBeforeYear, setChangeBeforeYear] = useState<number>(2020);
  const [changeAfterYear, setChangeAfterYear] = useState<number>(2024);
  const [changeResult, setChangeResult] = useState<TemporalChangeResult | null>(null);
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  // ── Land Degradation Indicator state ──────────────────────────────────────
  const [degradationResult, setDegradationResult] = useState<LandDegradationResult | null>(null);
  const [degLoading, setDegLoading] = useState(false);
  const [degError, setDegError] = useState<string | null>(null);

  useEffect(() => {
    getWatersheds().then(ws => {
      setWatersheds(ws);
      if (ws.length > 0) {
        setSelectedWsId(ws[0].properties.id);
      }
    });
    
  }, []);

  useEffect(() => {
    if (selectedWsId) {
      getLulcTrendByWatershed(selectedWsId).then(data => {
        setTrendData(data ?? null);
      });
      // Reset active queries when watershed changes
      setLiveResult(null);
      setLiveError(null);
      setSoilMoistureResult(null);
      setSmError(null);
      setChangeResult(null);
      setChangeError(null);
      setDegradationResult(null);
      setDegError(null);
    }
  }, [selectedWsId]);

  // Compute Live LULC via GEE
  const handleComputeLive = useCallback(async () => {
    if (!selectedWsId || liveLoading) return;
    setLiveLoading(true);
    setLiveError(null);
    try {
      const currentYear = new Date().getFullYear();
      const res = await fetch(
        `${API_BASE}/api/earth-engine/lulc/${selectedWsId}?year=${currentYear}`
      );
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data.message || `Server error (${res.status})`);
      } else {
        setLiveResult(data);
      }
    } catch (err) {
      setLiveError('Could not reach the backend server.');
    } finally {
      setLiveLoading(false);
    }
  }, [selectedWsId, liveLoading]);

  // Compute Sentinel-1 SAR Soil Moisture Index
  const handleComputeSoilMoisture = useCallback(async () => {
    if (!selectedWsId || smLoading) return;
    setSmLoading(true);
    setSmError(null);
    const outcome = await getSentinel1SoilMoisture(selectedWsId, {
      beforeStart: smBeforeStart,
      beforeEnd: smBeforeEnd,
      afterStart: smAfterStart,
      afterEnd: smAfterEnd,
    });
    setSmLoading(false);
    if (outcome.ok) {
      setSoilMoistureResult(outcome.data);
    } else {
      setSmError(outcome.error);
    }
  }, [selectedWsId, smLoading, smBeforeStart, smBeforeEnd, smAfterStart, smAfterEnd]);

  // Compute Temporal Change Detection
  const handleComputeChange = useCallback(async () => {
    if (!selectedWsId || changeLoading) return;
    setChangeLoading(true);
    setChangeError(null);
    const outcome = await getTemporalChange(selectedWsId, changeBeforeYear, changeAfterYear);
    setChangeLoading(false);
    if (outcome.ok) {
      setChangeResult(outcome.data);
    } else {
      setChangeError(outcome.error);
    }
  }, [selectedWsId, changeLoading, changeBeforeYear, changeAfterYear]);

  // Compute Land Degradation Indicator
  const handleComputeDegradation = useCallback(async () => {
    if (!selectedWsId || degLoading) return;
    setDegLoading(true);
    setDegError(null);
    const outcome = await getLandDegradation(selectedWsId, new Date().getFullYear());
    setDegLoading(false);
    if (outcome.ok) {
      setDegradationResult(outcome.data);
    } else {
      setDegError(outcome.error);
    }
  }, [selectedWsId, degLoading]);

  // Derived metrics for static trend chart
  const metrics = useMemo(() => {
    if (!trendData || trendData.years.length === 0) return null;
    const firstYearIdx = 0;
    const lastYearIdx = trendData.years.length - 1;

    return {
      forestDiff: trendData.forest_pct[lastYearIdx] - trendData.forest_pct[firstYearIdx],
      waterDiff: trendData.water_bodies_pct[lastYearIdx] - trendData.water_bodies_pct[firstYearIdx],
      agriDiff: trendData.agricultural_pct[lastYearIdx] - trendData.agricultural_pct[firstYearIdx],
      barrenDiff: trendData.barren_degraded_pct[lastYearIdx] - trendData.barren_degraded_pct[firstYearIdx],
      firstYear: trendData.years[firstYearIdx],
      lastYear: trendData.years[lastYearIdx],
    };
  }, [trendData]);

  const selectedWs = watersheds.find(w => w.properties.id === selectedWsId);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="border-b border-gray-200 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-dark">Spatial Analysis &amp; Satellite Remote Sensing</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Quantitative multi-sensor Earth observation: Landsat 8/9 surface reflectance &amp; Sentinel-1 C-band SAR.
          </p>
        </div>

        {/* Watershed Selector + Compute Live */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">Selected Watershed:</label>
          <select
            value={selectedWsId}
            onChange={e => setSelectedWsId(e.target.value)}
            className="text-xs border border-gray-200 rounded px-3 py-2 bg-white text-text-dark font-medium shadow-sm focus:outline-none"
          >
            {watersheds.map(w => (
              <option key={w.properties.id} value={w.properties.id}>
                {w.properties.name} ({w.properties.district})
              </option>
            ))}
          </select>

          <button
            onClick={handleComputeLive}
            disabled={liveLoading || !selectedWsId}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded shadow-sm transition-colors
              bg-emerald-600 text-white hover:bg-emerald-700
              disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run live NDVI/LULC classification via Google Earth Engine"
          >
            {liveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
            {liveLoading ? 'Computing…' : 'Compute Live LULC'}
          </button>
        </div>
      </div>

      {/* Provider Architecture & Provenance Status Banner */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-dark">Active Provider: Google Earth Engine</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                LIVE OPERATIONAL
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Live processing: Landsat 8/9 Surface Reflectance (30m) &amp; Sentinel-1 C-band SAR GRD IW (10m).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l border-gray-100 pt-2 md:pt-0 md:pl-4">
          <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-700">SRISHTI-DRISHTI Provider:</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
                INTEGRATION READY
              </span>
            </div>
            <p className="text-[10px] text-gray-400">
              Contract adapter configured for ISRO/NRSC authorized credentials.
            </p>
          </div>
        </div>
      </div>

      {/* Live GEE LULC Result Banner if computed */}
      {liveResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Live Earth Engine Analysis ({liveResult.year}) — {liveResult.watershed_name || selectedWs?.properties.name}
            </h3>
            <span className="text-[10px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
              Dataset: {liveResult.dataset || 'Landsat 8/9 Surface Reflectance'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div className="bg-white rounded p-2 border border-emerald-100">
              <span className="text-[10px] text-gray-500 block font-medium">Forest Cover</span>
              <span className="text-sm font-bold text-emerald-700">{liveResult.forest_pct}%</span>
            </div>
            <div className="bg-white rounded p-2 border border-emerald-100">
              <span className="text-[10px] text-gray-500 block font-medium">Agricultural Land</span>
              <span className="text-sm font-bold text-amber-700">{liveResult.agricultural_pct}%</span>
            </div>
            <div className="bg-white rounded p-2 border border-emerald-100">
              <span className="text-[10px] text-gray-500 block font-medium">Water Bodies</span>
              <span className="text-sm font-bold text-blue-700">{liveResult.water_bodies_pct}%</span>
            </div>
            <div className="bg-white rounded p-2 border border-emerald-100">
              <span className="text-[10px] text-gray-500 block font-medium">Barren / Degraded</span>
              <span className="text-sm font-bold text-rose-700">{liveResult.barren_degraded_pct}%</span>
            </div>
            <div className="bg-white rounded p-2 border border-emerald-100">
              <span className="text-[10px] text-gray-500 block font-medium">Mean NDVI Canopy</span>
              <span className="text-sm font-bold text-text-dark">{liveResult.ndvi_mean ?? 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {liveError && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <span>{liveError}</span>
        </div>
      )}

      {/* ── SECTION 1: SENTINEL-1 SAR SOIL MOISTURE ANALYSIS ────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-text-dark uppercase tracking-wider flex items-center gap-2">
              <Waves className="w-4 h-4 text-primary-600" /> Genuine Sentinel-1 SAR Soil Moisture Analysis
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Derived from C-band radar backscatter ($VV$ polarization) across satellite acquisition cycles.
            </p>
          </div>
          <span className="text-[10px] font-bold bg-primary-50 text-primary-700 border border-primary-200 px-2 py-0.5 rounded-full self-start sm:self-auto">
            RADAR HYDROLOGY
          </span>
        </div>

        {/* Date Selectors for Before/After Periods */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-gray-50 p-3.5 rounded-lg text-xs">
          <div>
            <label className="font-semibold text-gray-600 block mb-1">Before Start Date</label>
            <input
              type="date"
              value={smBeforeStart}
              onChange={e => setSmBeforeStart(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700"
            />
          </div>
          <div>
            <label className="font-semibold text-gray-600 block mb-1">Before End Date</label>
            <input
              type="date"
              value={smBeforeEnd}
              onChange={e => setSmBeforeEnd(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700"
            />
          </div>
          <div>
            <label className="font-semibold text-gray-600 block mb-1">After Start Date</label>
            <input
              type="date"
              value={smAfterStart}
              onChange={e => setSmAfterStart(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700"
            />
          </div>
          <div>
            <label className="font-semibold text-gray-600 block mb-1">After End Date</label>
            <input
              type="date"
              value={smAfterEnd}
              onChange={e => setSmAfterEnd(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700"
            />
          </div>
          <div>
            <button
              onClick={handleComputeSoilMoisture}
              disabled={smLoading || !selectedWsId}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-1.5 px-3 rounded shadow-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {smLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Droplets className="w-3.5 h-3.5" />}
              {smLoading ? 'Querying SAR…' : 'Query Soil Moisture'}
            </button>
          </div>
        </div>

        {/* SAR Soil Moisture Result Display */}
        {soilMoistureResult && (
          <div className="space-y-3 pt-2">
            {!soilMoistureResult.sufficient_data ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Data Sufficiency Notice:</span>
                  <p className="mt-0.5">{soilMoistureResult.message}</p>
                  <p className="mt-1 text-[11px] text-amber-700">
                    Before cycle observations: {soilMoistureResult.observation_counts?.before ?? 0} | After cycle observations: {soilMoistureResult.observation_counts?.after ?? 0}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Before Period SSMI</span>
                    <div className="text-xl font-bold text-text-dark mt-1">
                      {soilMoistureResult.periods?.before.ssmi_pct}%
                    </div>
                    <span className="text-[11px] text-gray-500">
                      Mean VV: {soilMoistureResult.periods?.before.mean_backscatter_db} dB ({soilMoistureResult.periods?.before.observation_count} passes)
                    </span>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">After Period SSMI</span>
                    <div className="text-xl font-bold text-text-dark mt-1">
                      {soilMoistureResult.periods?.after.ssmi_pct}%
                    </div>
                    <span className="text-[11px] text-gray-500">
                      Mean VV: {soilMoistureResult.periods?.after.mean_backscatter_db} dB ({soilMoistureResult.periods?.after.observation_count} passes)
                    </span>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Absolute Change</span>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-xl font-bold ${
                        (soilMoistureResult.change?.ssmi_absolute_delta_pct || 0) >= 0 ? 'text-tertiary-700' : 'text-accent-700'
                      }`}>
                        {(soilMoistureResult.change?.ssmi_absolute_delta_pct || 0) >= 0 ? '+' : ''}
                        {soilMoistureResult.change?.ssmi_absolute_delta_pct}%
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500">
                      Radar Δσ°: {soilMoistureResult.change?.backscatter_delta_db} dB
                    </span>
                  </div>

                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Moisture Trend</span>
                    <div className="mt-1">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        soilMoistureResult.change?.trend === 'Moisture Improvement' ? 'bg-emerald-100 text-emerald-800' :
                        soilMoistureResult.change?.trend === 'Moisture Deficit' ? 'bg-rose-100 text-rose-800' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {soilMoistureResult.change?.trend}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 block mt-1">
                      Rel. shift: {soilMoistureResult.change?.ssmi_relative_change_pct ? `${soilMoistureResult.change.ssmi_relative_change_pct}%` : '—'}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="font-semibold text-gray-500">Scientific Metric:</span> {soilMoistureResult.metric}. {soilMoistureResult.disclaimer} Dataset: {soilMoistureResult.dataset}.
                </p>
              </div>
            )}
          </div>
        )}

        {smError && (
          <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-700">
            {smError}
          </div>
        )}
      </div>

      {/* ── SECTION 2: TEMPORAL MULTI-SPECTRAL CHANGE DETECTION ──────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-text-dark uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-600" /> Temporal Multi-Spectral Change Detection
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Multi-year Landsat 8/9 surface reflectance comparison across custom periods.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={changeBeforeYear}
              onChange={e => setChangeBeforeYear(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
            >
              {[2018, 2019, 2020, 2021, 2022].map(y => (
                <option key={y} value={y}>Before: {y}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">vs</span>
            <select
              value={changeAfterYear}
              onChange={e => setChangeAfterYear(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700"
            >
              {[2023, 2024, 2025, 2026].map(y => (
                <option key={y} value={y}>After: {y}</option>
              ))}
            </select>
            <button
              onClick={handleComputeChange}
              disabled={changeLoading || !selectedWsId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1 rounded shadow-sm disabled:opacity-50 flex items-center gap-1"
            >
              {changeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Run Change Analysis'}
            </button>
          </div>
        </div>

        {changeResult && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded p-3 text-center">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">Forest Delta</span>
                <p className={`text-base font-bold mt-1 ${changeResult.deltas.forest_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {changeResult.deltas.forest_pct >= 0 ? '+' : ''}{changeResult.deltas.forest_pct}%
                </p>
                <span className="text-[11px] text-gray-400">{changeResult.metrics_before.forest_pct}% → {changeResult.metrics_after.forest_pct}%</span>
              </div>
              <div className="bg-gray-50 rounded p-3 text-center">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">Agriculture Delta</span>
                <p className={`text-base font-bold mt-1 ${changeResult.deltas.agricultural_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {changeResult.deltas.agricultural_pct >= 0 ? '+' : ''}{changeResult.deltas.agricultural_pct}%
                </p>
                <span className="text-[11px] text-gray-400">{changeResult.metrics_before.agricultural_pct}% → {changeResult.metrics_after.agricultural_pct}%</span>
              </div>
              <div className="bg-gray-50 rounded p-3 text-center">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">Water Body Delta</span>
                <p className={`text-base font-bold mt-1 ${changeResult.deltas.water_bodies_pct >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                  {changeResult.deltas.water_bodies_pct >= 0 ? '+' : ''}{changeResult.deltas.water_bodies_pct}%
                </p>
                <span className="text-[11px] text-gray-400">{changeResult.metrics_before.water_bodies_pct}% → {changeResult.metrics_after.water_bodies_pct}%</span>
              </div>
              <div className="bg-gray-50 rounded p-3 text-center">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">Barren Land Shift</span>
                <p className={`text-base font-bold mt-1 ${changeResult.deltas.barren_degraded_pct <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {changeResult.deltas.barren_degraded_pct >= 0 ? '+' : ''}{changeResult.deltas.barren_degraded_pct}%
                </p>
                <span className="text-[11px] text-gray-400">{changeResult.metrics_before.barren_degraded_pct}% → {changeResult.metrics_after.barren_degraded_pct}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs bg-emerald-50 text-emerald-900 p-2.5 rounded border border-emerald-100">
              <span className="font-semibold">Spectral Canopy Evaluation: {changeResult.vegetation_trend}</span>
              <span>NDVI Delta: {changeResult.deltas.ndvi_mean !== null ? (changeResult.deltas.ndvi_mean >= 0 ? `+${changeResult.deltas.ndvi_mean}` : changeResult.deltas.ndvi_mean) : '—'}</span>
            </div>
          </div>
        )}

        {changeError && (
          <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-700">
            {changeError}
          </div>
        )}
      </div>

      {/* ── SECTION 3: SATELLITE-DERIVED LAND DEGRADATION INDICATOR ─────────── */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-text-dark uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Satellite-Derived Land Degradation Indicator
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Multi-criteria screening indicator combining vegetation stress, bare soil exposure, and SRTM slope.
            </p>
          </div>
          <button
            onClick={handleComputeDegradation}
            disabled={degLoading || !selectedWsId}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            {degLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Evaluate Degradation'}
          </button>
        </div>

        {degradationResult && (
          <div className="space-y-4 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 gap-3">
              <div>
                <span className="text-xs text-gray-400 font-semibold block uppercase">Land Degradation Risk Tier</span>
                <span className={`text-lg font-bold ${
                  degradationResult.degradation_risk === 'High' ? 'text-rose-600' :
                  degradationResult.degradation_risk === 'Moderate' ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {degradationResult.degradation_risk} Risk
                </span>
              </div>
              <div className="sm:text-right">
                <span className="text-xs text-gray-400 font-semibold block uppercase">Composite Degradation Index</span>
                <span className="text-2xl font-bold text-text-dark">
                  {degradationResult.degradation_index} <span className="text-xs text-gray-400 font-normal">/ 100</span>
                </span>
              </div>
            </div>

            {/* Contributing Factor Breakdown */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">Contributing Environmental Factors</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="border border-gray-100 p-2.5 rounded bg-white">
                  <span className="text-gray-400 block text-[10px] font-semibold">Bare Soil Exposure (35%)</span>
                  <span className="text-sm font-bold text-text-dark">{degradationResult.factor_breakdown.barren_soil_exposure.score} / 100</span>
                  <span className="text-[10px] text-gray-500 block">{degradationResult.factor_breakdown.barren_soil_exposure.measured_barren_pct}% bare surface</span>
                </div>
                <div className="border border-gray-100 p-2.5 rounded bg-white">
                  <span className="text-gray-400 block text-[10px] font-semibold">Vegetation Vigor Deficit (30%)</span>
                  <span className="text-sm font-bold text-text-dark">{degradationResult.factor_breakdown.vegetation_vigor_stress.score} / 100</span>
                  <span className="text-[10px] text-gray-500 block">NDVI: {degradationResult.factor_breakdown.vegetation_vigor_stress.measured_ndvi}</span>
                </div>
                <div className="border border-gray-100 p-2.5 rounded bg-white">
                  <span className="text-gray-400 block text-[10px] font-semibold">Topographic Slope Risk (20%)</span>
                  <span className="text-sm font-bold text-text-dark">{degradationResult.factor_breakdown.topographic_slope_vulnerability.score} / 100</span>
                  <span className="text-[10px] text-gray-500 block">{degradationResult.factor_breakdown.topographic_slope_vulnerability.mean_slope_degrees}° mean slope</span>
                </div>
                <div className="border border-gray-100 p-2.5 rounded bg-white">
                  <span className="text-gray-400 block text-[10px] font-semibold">Moisture Stress Deficit (15%)</span>
                  <span className="text-sm font-bold text-text-dark">{degradationResult.factor_breakdown.surface_moisture_deficit.score} / 100</span>
                  <span className="text-[10px] text-gray-500 block">NDWI: {degradationResult.factor_breakdown.surface_moisture_deficit.measured_ndwi}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              {degradationResult.methodology} {degradationResult.disclaimer}
            </p>
          </div>
        )}

        {degError && (
          <div className="bg-rose-50 border border-rose-200 rounded p-3 text-xs text-rose-700">
            {degError}
          </div>
        )}
      </div>

      {/* ── SECTION 4: HISTORIC GIS BASELINE TREND ──────────────────────────── */}
      {trendData && metrics && selectedWs && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-dark">Watershed Baseline Classification Trend</h2>
                <p className="text-xs text-gray-500 mt-0.5">Configured GIS multi-year benchmark for {selectedWs.properties.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-semibold uppercase">
                  CONFIGURED DATASET
                </span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded font-semibold">
                  Area: {selectedWs.properties.area_sq_km} km²
                </span>
              </div>
            </div>
            
            <div className="pt-2">
              <LulcTrendChart data={trendData} type="area" />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-text-dark uppercase tracking-wider">
              Historic Shifts ({metrics.firstYear} vs {metrics.lastYear})
            </h2>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Forest Cover</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.forest_pct[trendData.forest_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">of watershed territory</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.forestDiff >= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.forestDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {metrics.forestDiff >= 0 ? '+' : ''}{metrics.forestDiff.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Water Bodies</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.water_bodies_pct[trendData.water_bodies_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">surface water percentage</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.waterDiff >= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.waterDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {metrics.waterDiff >= 0 ? '+' : ''}{metrics.waterDiff.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 flex items-start justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Agricultural Land</span>
                <p className="text-lg font-bold text-text-dark mt-0.5">
                  {trendData.agricultural_pct[trendData.agricultural_pct.length - 1]}%
                </p>
                <span className="text-xs text-gray-500">cultivated farmland</span>
              </div>
              <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                metrics.agriDiff >= 0 ? 'bg-tertiary-50 text-tertiary-700' : 'bg-accent-50 text-accent-700'
              }`}>
                {metrics.agriDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {metrics.agriDiff >= 0 ? '+' : ''}{metrics.agriDiff.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpatialAnalysis;