import React, { useEffect, useState, useMemo } from 'react';
import { getWatersheds } from '../services/watershedService';
import { getProjectsByWatershed } from '../services/projectService';
import { getLulcTrendByWatershed } from '../services/gisService';
import { getGeoEvidence } from '../services/evidenceService';
import type { WatershedFeature, Project, LulcTrendEntry, GeoEvidence } from '../types';
import LulcTrendChart from '../components/LulcTrendChart';
import { FileText, Printer, ShieldAlert, Award, Calendar, CheckSquare, Rocket, Satellite, Droplets, BrainCircuit, KeyRound } from 'lucide-react';

const ReportsPage: React.FC = () => {
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [trendData, setTrendData] = useState<LulcTrendEntry | null>(null);
  const [evidenceList, setEvidenceList] = useState<GeoEvidence[]>([]);

  useEffect(() => {
    getWatersheds().then(ws => {
      setWatersheds(ws);
      if (ws.length > 0) {
        setSelectedWsId(ws[0].properties.id);
      }
    });
    getGeoEvidence().then(setEvidenceList);
  }, []);

  useEffect(() => {
    if (selectedWsId) {
      getProjectsByWatershed(selectedWsId).then(setProjects);
      getLulcTrendByWatershed(selectedWsId).then(data => setTrendData(data ?? null));
    }
  }, [selectedWsId]);

  const selectedWs = watersheds.find(w => w.properties.id === selectedWsId);

  // Derived stats
  const stats = useMemo(() => {
    if (projects.length === 0) return { total: 0, done: 0, pct: 0, delayed: 0, ongoing: 0 };
    const total = projects.length;
    const done = projects.filter(p => p.status === 'Completed').length;
    const delayed = projects.filter(p => p.status === 'Delayed').length;
    const ongoing = projects.filter(p => p.status === 'Ongoing').length;
    const pct = Math.round((done / total) * 100);
    return { total, done, pct, delayed, ongoing };
  }, [projects]);

  const evidenceMap = useMemo(() => {
    return new Map(evidenceList.map(e => [e.project_id, e]));
  }, [evidenceList]);

  // Average trust score
  const avgTrust = useMemo(() => {
    const wsProjectIds = new Set(projects.map(p => p.id));
    const wsEvidence = evidenceList.filter(e => wsProjectIds.has(e.project_id));
    if (wsEvidence.length === 0) return 0;
    const total = wsEvidence.reduce((sum, e) => sum + e.trust_score, 0);
    return Math.round((total / wsEvidence.length) * 10) / 10;
  }, [projects, evidenceList]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Configuration bar (hidden on print) */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h1 className="text-base font-bold text-text-dark">Report Generator</h1>
            <p className="text-xs text-gray-500">Configure parameters to compile official print-friendly watershed summaries.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-700 whitespace-nowrap">Watershed:</label>
            <select
              value={selectedWsId}
              onChange={e => setSelectedWsId(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2.5 py-1.5 bg-white text-text-dark font-medium shadow-sm focus:outline-none"
            >
              {watersheds.map(w => (
                <option key={w.properties.id} value={w.properties.id}>
                  {w.properties.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-3 py-1.5 rounded transition-all shadow-sm"
          >
            <Printer className="w-3.5 h-3.5" /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Official Document Layout */}
      {selectedWs && (
        <div className="bg-white border border-gray-300 rounded-lg p-8 shadow-sm print:border-none print:shadow-none print:p-0 space-y-6 text-text-dark">
          {/* Official Document Header */}
          <div className="text-center border-b-2 border-gray-800 pb-4 relative">
            <h2 className="text-lg font-bold uppercase tracking-wide">Government of India</h2>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 mt-0.5">Ministry of Rural Development | Department of Land Resources</h3>
            <h1 className="text-2xl font-black text-primary-700 mt-2">JalDrishti Watershed Audit Report</h1>
            <p className="text-xs text-gray-400 mt-1 italic">Generated on {new Date().toLocaleDateString()} via JalDrishti Decision Support Suite</p>

            <div className="absolute top-2 right-2 text-right hidden sm:block print:block">
              <span className="text-[10px] uppercase font-bold text-gray-400">Team Code Whisperers</span>
            </div>
          </div>

          {/* Metadata Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-surface-card p-4 rounded-lg border border-gray-200">
            <div>
              <span className="block text-[10px] uppercase font-semibold text-gray-500">Watershed Name</span>
              <span className="text-sm font-bold text-text-dark">{selectedWs.properties.name}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-semibold text-gray-500">District / State</span>
              <span className="text-sm font-bold text-text-dark">{selectedWs.properties.district}, {selectedWs.properties.state}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-semibold text-gray-500">Registered Area</span>
              <span className="text-sm font-bold text-text-dark">{selectedWs.properties.area_sq_km} sq km</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-semibold text-gray-500">Watershed ID</span>
              <span className="text-sm font-bold text-primary-600">{selectedWs.properties.id}</span>
            </div>
          </div>

          {/* Statistical Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-gray-200 rounded p-4 text-center">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Project Completion</span>
              <span className="text-2xl font-black text-tertiary-600 mt-1 block">{stats.pct}%</span>
              <span className="text-xs text-gray-500 mt-1 block">{stats.done} of {stats.total} structures completed</span>
            </div>
            <div className="border border-gray-200 rounded p-4 text-center">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Ongoing &amp; Stalled</span>
              <span className="text-2xl font-black text-text-dark mt-1 block">{stats.ongoing + stats.delayed}</span>
              <span className="text-xs text-gray-500 mt-1 block">{stats.ongoing} ongoing, {stats.delayed} delayed structures</span>
            </div>
            <div className="border border-gray-200 rounded p-4 text-center">
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Avg Trust Index</span>
              <span className="text-2xl font-black text-primary-600 mt-1 block">{avgTrust}/5.0</span>
              <span className="text-xs text-gray-500 mt-1 block">Geo-evidence validation reliability</span>
            </div>
          </div>

          {/* LULC Trend Summary */}
          {trendData && (
            <div className="border border-gray-200 rounded-lg p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-primary-600" />
                  Land Cover Temporal Trends
                </h4>
                <span className="text-xs text-gray-400 italic">Precomputed reference epochs</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="md:col-span-2">
                  <LulcTrendChart data={trendData} type="bar" />
                </div>
                <div className="space-y-3 text-xs">
                  <p className="leading-relaxed text-gray-600">
                    A summary of the land-use classification trends demonstrates major zone transitions between <strong className="text-text-dark">2020</strong> and <strong className="text-text-dark">2026</strong>.
                  </p>
                  <div className="bg-surface-card p-2.5 rounded border border-gray-200 space-y-1">
                    <div className="flex justify-between">
                      <span>Forest Cover Change:</span>
                      <span className="font-bold">
                        {(trendData.forest_pct[trendData.forest_pct.length - 1] - trendData.forest_pct[0]).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Water Body Surface:</span>
                      <span className="font-bold">
                        {(trendData.water_bodies_pct[trendData.water_bodies_pct.length - 1] - trendData.water_bodies_pct[0]).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Table of Flagged / Audited Projects */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5 text-accent-700 border-b border-gray-200 pb-2">
              <ShieldAlert className="w-4 h-4 text-accent-500" />
              Flagged Structures &amp; Location Mismatches
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-gray-500 font-bold">
                    <th className="pb-2">Intervention Name</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-center">Trust Rating</th>
                    <th className="pb-2 text-right">Offset (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-400 font-medium">No projects found in watershed.</td>
                    </tr>
                  ) : (
                    projects.map(proj => {
                      const ev = evidenceMap.get(proj.id);
                      const isFlagged = proj.status === 'Delayed' || (ev && ev.trust_score <= 2);
                      if (!isFlagged) return null;
                      return (
                        <tr key={proj.id} className="border-b border-gray-100">
                          <td className="py-2 font-semibold text-text-dark">{proj.name}</td>
                          <td className="py-2 text-gray-600">{proj.type}</td>
                          <td className="py-2 font-bold text-accent-600">{proj.status}</td>
                          <td className="py-2 text-center font-bold text-accent-700">{ev ? `${ev.trust_score}/5` : '—'}</td>
                          <td className="py-2 text-right text-gray-600 font-semibold">{ev ? ev.distance_from_registered_location_m : '—'} m</td>
                        </tr>
                      );
                    })
                  )}
                  {projects.filter(p => {
                    const ev = evidenceMap.get(p.id);
                    return p.status === 'Delayed' || (ev && ev.trust_score <= 2);
                  }).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-tertiary-600 font-bold bg-tertiary-50 border border-tertiary-200 rounded">
                        All geo-evidence checks verified. Zero mismatch flags in this sector.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Data Provenance & Earth Observation Specifications */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5 text-text-dark border-b border-gray-200 pb-2">
              <Satellite className="w-4 h-4 text-primary-600" />
              Data Provenance &amp; Scientific Specifications
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-500 font-bold">
                    <th className="pb-2">Analytical Metric</th>
                    <th className="pb-2">Data Engine</th>
                    <th className="pb-2">Sensor / Dataset</th>
                    <th className="pb-2">Resolution</th>
                    <th className="pb-2">Provenance Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="py-2 font-semibold">Soil Moisture Index (SSMI)</td>
                    <td className="py-2">Google Earth Engine</td>
                    <td className="py-2">Sentinel-1 C-band SAR (VV polarisation)</td>
                    <td className="py-2">10 metres</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">LIVE SATELLITE (DERIVED)</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">LULC &amp; Vegetation Canopy</td>
                    <td className="py-2">Google Earth Engine</td>
                    <td className="py-2">Landsat 8/9 OLI/TIRS Surface Reflectance</td>
                    <td className="py-2">30 metres</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">LIVE / PROCESSED</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Topographic Slope &amp; Relief</td>
                    <td className="py-2">USGS / NASA</td>
                    <td className="py-2">SRTM GL1 Global 1-arcsecond DEM</td>
                    <td className="py-2">30 metres</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">PROCESSED TERRAIN</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Watershed &amp; Drainage Boundaries</td>
                    <td className="py-2">State Remote Sensing Center</td>
                    <td className="py-2">Official Watershed Delineation Vector</td>
                    <td className="py-2">1:50,000 Scale</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-bold text-[10px]">CONFIGURED DATASET</span></td>
                  </tr>
                  <tr>
                    <td className="py-2 font-semibold">Intervention Works Inventory</td>
                    <td className="py-2">Field Engineering Records</td>
                    <td className="py-2">Dungarpur Micro-Intervention Sample Dataset</td>
                    <td className="py-2">GPS Points</td>
                    <td className="py-2"><span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">DEMONSTRATION DATA</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Full Structure Inventory */}
          <div className="space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5 text-text-dark border-b border-gray-200 pb-2">
              <CheckSquare className="w-4 h-4 text-primary-600" />
              Complete Structure Inventory
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-300 text-gray-500 font-bold">
                    <th className="pb-2">ID</th>
                    <th className="pb-2">Structure</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Completion</th>
                    <th className="pb-2">Last Inspection</th>
                    <th className="pb-2 text-right">Age (yrs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {projects.map(proj => (
                    <tr key={proj.id}>
                      <td className="py-2 font-semibold text-gray-500">{proj.id}</td>
                      <td className="py-2 font-semibold text-text-dark">{proj.name}</td>
                      <td className="py-2 text-gray-600">{proj.type}</td>
                      <td className="py-2 font-bold">{proj.completion_pct}%</td>
                      <td className="py-2 text-gray-500">{proj.last_inspection_date}</td>
                      <td className="py-2 text-right text-gray-500">{proj.structure_age_years}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Verification / Footer Sign-off */}
          <div className="pt-8 border-t border-dashed border-gray-300 flex justify-between text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Audited on: {new Date().toLocaleDateString()}</span>
            </div>
            <div className="text-right">
              <p className="font-bold text-gray-500">Department Auditor Sign-off</p>
              <div className="w-40 h-8 border-b border-gray-300 mt-2 ml-auto" />
              <p className="text-[10px] text-gray-300 mt-1">Authorized Electronic Signature Required</p>
            </div>
          </div>
        </div>
      )}

      {/* System Operational Architecture Status */}
      <div className="print:hidden bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-secondary-100 flex items-center justify-center flex-shrink-0">
            <Rocket className="w-5 h-5 text-secondary-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-text-dark">System Operational Architecture &amp; Data Pipeline</h3>
            <p className="text-xs text-gray-500">SIH26015 solution operational baseline and provider integration status.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              icon: Satellite,
              iconBg: 'bg-primary-100',
              iconColor: 'text-primary-600',
              title: 'Decoupled SRISHTI-DRISHTI Provider Architecture',
              desc: 'Implemented clean SatelliteDataProvider abstraction. GoogleEarthEngineProvider acts as the operational engine, with SrishtiDrishtiProvider as an integration-ready adapter conforming to ISRO/NRSC OGC and GeoTIFF standards.',
            },
            {
              icon: Droplets,
              iconBg: 'bg-tertiary-100',
              iconColor: 'text-tertiary-600',
              title: 'Sentinel-1 C-band SAR Soil Moisture Pipeline',
              desc: 'Live query pipeline for COPERNICUS/S1_GRD VV polarization radar backscatter. Normalizes dynamic backscatter to relative Surface Soil Moisture Index (SSMI) with explicit data-sufficiency checks.',
            },
            {
              icon: BrainCircuit,
              iconBg: 'bg-secondary-100',
              iconColor: 'text-secondary-600',
              title: 'Multi-Factor Evidence Validation Engine',
              desc: 'Evaluates field photos using point-in-polygon ray-casting watershed containment, registered intervention distance audit, timestamp verification, and live satellite corroboration, computing a 0–100 trust score.',
            },
            {
              icon: KeyRound,
              iconBg: 'bg-accent-100',
              iconColor: 'text-accent-600',
              title: 'Production Auth & Cloud Deployment Readiness',
              desc: 'JWT authentication with bcrypt password verification, dynamic CORS origin handling via FRONTEND_URL, and cloud-native EE_SERVICE_ACCOUNT_KEY_JSON support for Render deployment.',
            },
          ].map(item => (
            <div key={item.title} className="border border-gray-100 rounded-lg p-4 flex gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                <item.icon className={`w-4 h-4 ${item.iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-dark leading-snug">{item.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
