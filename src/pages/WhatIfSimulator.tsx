import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle as CircleStyle, Text as OlText } from 'ol/style';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import type { FeatureLike } from 'ol/Feature';
import { Link } from 'react-router-dom';

import { getGisLayers } from '../services/gisService';
import { getProjects } from '../services/projectService';
import { computeAllSuitabilityScores, CHECK_PASS_THRESHOLD, getSlopeCategoryAt } from '../utils/whatIfScore';
import { validateRecommendationEngine, type ValidationResult } from '../utils/engineValidation';
import Structure3DPreview from '../components/Structure3DPreview';
import type {
  CandidateInterventionType, RankedLocation, RankedCandidate, GisFeature, Project,
} from '../types';
import {
  HelpCircle, Trash2, ShieldAlert, Sparkles, CheckCircle, XCircle,
  Trophy, GitCompare, MapPin, X, BarChart3, ChevronDown, ChevronUp, Box, Beaker,
} from 'lucide-react';

import 'ol/ol.css';

// Colours reused from the existing JalDrishti palette — one distinct colour
// per candidate intervention type, so a location's marker can be tinted by
// its top-ranked recommendation at a glance.
const TYPE_COLORS: Record<CandidateInterventionType, string> = {
  'Check Dam':         '#8B6844', // Earth Brown
  'Farm Pond':         '#2C6E8E', // Deep Water Blue
  'Percolation Tank':  '#5BA8C4', // Water tint
  'Contour Bunding':   '#6B8E4E', // Vegetation Green
  'Farm Bund':         '#C97B4A', // Terracotta
};

const MAX_LOCATIONS = 3;

const CHECK_LABELS: { key: keyof RankedCandidate['checks']; label: string }[] = [
  { key: 'nearDrainage',    label: 'Near Drainage' },
  { key: 'suitableSlope',   label: 'Suitable Slope' },
  { key: 'nearWaterFlow',   label: 'Near Water Flow' },
  { key: 'landUseSuitable', label: 'Land-Use Suitable' },
  { key: 'noConflict',      label: 'No Existing Conflict' },
];

const WhatIfSimulator: React.FC = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const olMap = useRef<Map | null>(null);

  const [locations, setLocations] = useState<RankedLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [preview3D, setPreview3D] = useState<{ results: RankedCandidate[]; slope: string } | null>(null);

  // Data refs used inside the OL click closure (loaded once, read via ref
  // rather than as a useEffect dependency, so the map itself only inits once).
  const gisFeaturesRef = useRef<GisFeature[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const locationSource = useRef<VectorSource>(new VectorSource());
  const locationsRef = useRef<RankedLocation[]>([]); // mirrors `locations` for the OL click closure

  const activeLocation = locations.find(l => l.id === activeLocationId) ?? null;

  // Keep the ref in sync with state on every change (additions, deletions, clear-all).
  useEffect(() => {
    locationsRef.current = locations;
  }, [locations]);

  // ── Load background layers + init map (once) ──────────────────────────────
  useEffect(() => {
    Promise.all([getGisLayers(), getProjects()]).then(([gisCollection, projects]) => {
      gisFeaturesRef.current = gisCollection.features;
      projectsRef.current = projects;
      setValidation(validateRecommendationEngine(projects, gisCollection.features));

      if (!mapRef.current || olMap.current) return;

      const format = new GeoJSON();
      const baseLayer = new TileLayer({ source: new OSM() });

      // Background layer: water bodies + drainage only, for visual context
      // while placing points (same simplification as before).
      const backgroundSrc = new VectorSource({
        features: format.readFeatures(gisCollection, { featureProjection: 'EPSG:3857' }),
      });
      const backgroundLayer = new VectorLayer({
        source: backgroundSrc,
        style: (feature: FeatureLike) => {
          const props = feature.getProperties();
          if (props.layer_type === 'water_bodies') {
            return new Style({
              image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color: 'rgba(91,168,196,0.3)' }),
                stroke: new Stroke({ color: '#5BA8C4', width: 1 }),
              }),
            });
          }
          if (props.layer_type === 'drainage') {
            return new Style({
              stroke: new Stroke({ color: 'rgba(44,110,142,0.4)', width: 1.5 }),
            });
          }
          return new Style(); // Hide LULC/slope/interventions for simulator simplicity
        },
      });

      const locationLayer = new VectorLayer({
        source: locationSource.current,
        zIndex: 100,
      });

      const map = new Map({
        target: mapRef.current,
        layers: [baseLayer, backgroundLayer, locationLayer],
        view: new View({
          center: fromLonLat([77.5, 25.5]),
          zoom: 7,
        }),
      });

      olMap.current = map;

      map.on('singleclick', (evt) => {
        // If the click hit an existing location marker, just make it active
        // instead of adding a new one.
        let hitId: string | null = null;
        map.forEachFeatureAtPixel(evt.pixel, (feature) => {
          const id = feature.get('locationId') as string | undefined;
          if (id) { hitId = id; return true; }
        });
        if (hitId) {
          setActiveLocationId(hitId);
          setCompareOpen(false);
          return;
        }

        const coords = toLonLat(evt.coordinate);
        const lng = coords[0];
        const lat = coords[1];

        if (locationsRef.current.length >= MAX_LOCATIONS) {
          alert(`Maximum of ${MAX_LOCATIONS} locations reached. Remove one to add another.`);
          return;
        }

        const results = computeAllSuitabilityScores(
          lat, lng, gisFeaturesRef.current, projectsRef.current
        );
        const newLocation: RankedLocation = {
          id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          lat, lng, results,
        };

        // setLocations' updater is kept pure (no side effects inside) so it
        // behaves correctly under React StrictMode's dev-time double-invoke.
        // activeLocationId is set separately, once, from the exact same
        // newLocation object that gets appended below — so it always matches.
        locationsRef.current = [...locationsRef.current, newLocation];
        setLocations(prev => [...prev, newLocation]);
        setActiveLocationId(newLocation.id);
        setCompareOpen(false);
      });
    });

    return () => {
      olMap.current?.setTarget(undefined);
      olMap.current = null;
    };
  }, []);

  // ── Sync location markers with map, tinted by each location's top type ────
  useEffect(() => {
    locationSource.current.clear();

    locations.forEach((loc, idx) => {
      const top = loc.results[0];
      const isActive = loc.id === activeLocationId;
      const feat = new Feature({ geometry: new Point(fromLonLat([loc.lng, loc.lat])) });
      feat.set('locationId', loc.id);
      feat.setStyle(
        new Style({
          image: new CircleStyle({
            radius: isActive ? 14 : 11,
            fill: new Fill({ color: top ? TYPE_COLORS[top.type] : '#2C6E8E' }),
            stroke: new Stroke({ color: '#fff', width: isActive ? 3 : 2 }),
          }),
          text: new OlText({
            text: (idx + 1).toString(),
            font: 'bold 12px sans-serif',
            fill: new Fill({ color: '#fff' }),
          }),
        })
      );
      locationSource.current.addFeature(feat);
    });
  }, [locations, activeLocationId]);

  const deleteLocation = (id: string) => {
    setLocations(prev => {
      const next = prev.filter(l => l.id !== id);
      if (activeLocationId === id) {
        setActiveLocationId(next.length ? next[next.length - 1].id : null);
        setCompareOpen(false);
      }
      return next;
    });
  };

  const clearAll = () => {
    setLocations([]);
    setActiveLocationId(null);
    setCompareOpen(false);
  };

  const rankNo = ['🥇', '🥈', '🥉', '4', '5'];

  return (
    <div className="flex h-[calc(100vh-89px)] overflow-hidden bg-surface-card relative">
      {/* Sidebar */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto z-10 p-4 space-y-4">
        <div>
          <h1 className="text-base font-bold text-text-dark flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-600" />
            Recommendation Engine
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Click anywhere on the map — we&rsquo;ll rank all five intervention types for that location.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-primary-50 border border-primary-100 rounded p-3 flex gap-2 text-xs text-primary-800">
          <HelpCircle className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">How it works:</strong>
            1. Click a location on the map.<br />
            2. We instantly rank all 5 intervention types for that spot.<br />
            3. See the recommended structure and why.<br />
            4. Compare the top two side-by-side.
          </div>
        </div>

        {/* Location chips */}
        {locations.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Locations ({locations.length}/{MAX_LOCATIONS})
              </span>
              <button
                onClick={clearAll}
                className="text-xs text-accent-600 hover:text-accent-800 font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
            </div>
            <div className="flex gap-2">
              {locations.map((loc, idx) => (
                <button
                  key={loc.id}
                  onClick={() => { setActiveLocationId(loc.id); setCompareOpen(false); }}
                  className={`relative flex-1 text-xs py-1.5 rounded border font-semibold transition-all ${
                    loc.id === activeLocationId
                      ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-primary-300'
                  }`}
                >
                  #{idx + 1}
                  <span
                    onClick={(e) => { e.stopPropagation(); deleteLocation(loc.id); }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:border-accent-400"
                  >
                    <X className="w-2.5 h-2.5 text-gray-500" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {locations.length === 0 && (
          <div className="flex-1 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center p-6 text-center text-gray-400 min-h-[200px]">
            <MapPin className="w-8 h-8 text-gray-300 mb-2 animate-pulse" />
            <span className="text-xs font-medium">Click on the map to rank interventions for a location</span>
          </div>
        )}

        {/* Active location results */}
        {activeLocation && (
          <div className="space-y-3">
            <div className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {activeLocation.lat.toFixed(4)}&deg;N, {activeLocation.lng.toFixed(4)}&deg;E
            </div>

            {/* Ranked bar list */}
            <div className="space-y-1.5">
              {activeLocation.results.map((r, idx) => (
                <div key={r.type} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center flex-shrink-0">{rankNo[idx]}</span>
                  <span className="w-32 flex-shrink-0 font-semibold text-text-dark truncate">{r.type}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full ${
                        idx === 0 ? 'bg-tertiary-500' : idx === 1 ? 'bg-primary-500' : 'bg-gray-300'
                      }`}
                      style={{ width: `${r.total}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-bold text-text-dark flex-shrink-0">{r.total}</span>
                </div>
              ))}
            </div>

            {/* Recommended card */}
            <div className="bg-tertiary-50 border border-tertiary-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-tertiary-600 flex-shrink-0" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommended</span>
              </div>
              <p className="text-sm font-black text-tertiary-700">
                {activeLocation.results[0].type} — {activeLocation.results[0].total}/100
              </p>

              {/* Checklist */}
              <div className="grid grid-cols-1 gap-1 mt-2.5">
                {CHECK_LABELS.map(({ key, label }) => {
                  const passed = activeLocation.results[0].checks[key];
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

              {activeLocation.results[0].conflict && (
                <div className="mt-2 pt-2 border-t border-tertiary-100 text-xs text-accent-700">
                  Conflicts with <strong>{activeLocation.results[0].conflict.projectName}</strong> ({activeLocation.results[0].conflict.distanceM} m away)
                </div>
              )}

              <Link
                to={`/simulation?lat=${activeLocation.lat}&lng=${activeLocation.lng}&type=${encodeURIComponent(activeLocation.results[0].type)}`}
                className="w-full mt-3 text-xs py-2 rounded bg-primary-600 hover:bg-primary-700 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Beaker className="w-3.5 h-3.5" /> Run Impact Simulation
              </Link>

              <button
                onClick={() => {
                  const slope = getSlopeCategoryAt(activeLocation.lat, activeLocation.lng, gisFeaturesRef.current);
                  setPreview3D({ results: activeLocation.results, slope });
                }}
                className="w-full mt-2 text-xs py-2 rounded bg-tertiary-600 hover:bg-tertiary-700 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Box className="w-3.5 h-3.5" /> View 3D Preview
              </button>
            </div>

            {/* Compare toggle */}
            {activeLocation.results.length >= 2 && (
              <div>
                <button
                  onClick={() => setCompareOpen(v => !v)}
                  className="w-full text-xs py-2 rounded border border-primary-200 text-primary-700 font-semibold flex items-center justify-center gap-1.5 hover:bg-primary-50 transition-colors"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  {compareOpen ? 'Hide Comparison' : `Compare vs ${activeLocation.results[1].type}`}
                </button>

                {compareOpen && (
                  <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-surface-card text-gray-500">
                          <th className="text-left font-semibold px-2 py-1.5">Factor</th>
                          <th className="text-right font-semibold px-2 py-1.5">{activeLocation.results[0].type}</th>
                          <th className="text-right font-semibold px-2 py-1.5">{activeLocation.results[1].type}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(['drainage', 'water', 'landUse', 'slope'] as const).map(factor => (
                          <tr key={factor}>
                            <td className="px-2 py-1.5 text-gray-600 capitalize">
                              {factor === 'landUse' ? 'Land Use' : factor}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium text-text-dark">
                              {activeLocation.results[0].breakdown[factor]}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium text-text-dark">
                              {activeLocation.results[1].breakdown[factor]}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-surface-card font-bold">
                          <td className="px-2 py-1.5 text-text-dark">Overall</td>
                          <td className="px-2 py-1.5 text-right text-tertiary-700">{activeLocation.results[0].total}</td>
                          <td className="px-2 py-1.5 text-right text-primary-700">{activeLocation.results[1].total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Internal Prototype Validation — backtesting against the project's
            own reference intervention records, not independently-verified
            real-world accuracy. */}
        {validation && (
          <div className="border-t border-gray-200 pt-3">
            <button
              onClick={() => setValidationOpen(v => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-text-dark"
            >
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-primary-600" />
                Internal Prototype Validation
              </span>
              {validationOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>

            {validationOpen && (
              <div className="mt-2 space-y-2 text-xs">
                <p className="text-gray-500 leading-relaxed">
                  Validated against the project's {validation.totalEligible} reference intervention
                  records — does the engine's ranking match the recorded intervention type at each site?
                  This is internal prototype validation, not an independently-verified real-world
                  accuracy study.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-surface-card rounded p-2">
                    <p className="text-gray-400">Exact top-1 match</p>
                    <p className="text-base font-bold text-text-dark">{validation.accuracy}%</p>
                    <p className="text-gray-400">{validation.topPickMatches}/{validation.totalEligible}</p>
                  </div>
                  <div className="bg-surface-card rounded p-2">
                    <p className="text-gray-400">Reference type in top-3</p>
                    <p className="text-base font-bold text-text-dark">{validation.top3Accuracy}%</p>
                    <p className="text-gray-400">{validation.top3Matches}/{validation.totalEligible}</p>
                  </div>
                </div>
                <p className="text-gray-400 leading-relaxed">
                  {validation.totalExcluded} project(s) excluded: {validation.excludedReason}
                  {' '}Contour Trenching is scored as a near-match for Contour Bunding, not
                  an exact type.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="border-t border-gray-200 pt-3 flex gap-2 text-xs text-accent-700 font-medium">
          <ShieldAlert className="w-4 h-4 text-accent-500 flex-shrink-0 mt-0.5" />
          <span>
            Disclaimer: Suitability scores are a transparent, rule-based heuristic
            (checks pass at &ge;{CHECK_PASS_THRESHOLD}/100) — not a dynamic
            hydrological or runoff prediction model. Slope input is real
            SRTM 30m elevation data (Google Earth Engine); drainage, water and
            land-use inputs remain a structured prototype dataset.
          </span>
        </div>
      </div>

      {/* Interactive map view */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {preview3D && (
        <Structure3DPreview
          results={preview3D.results}
          slopeCategory={preview3D.slope as 'Flat' | 'Gentle' | 'Moderate' | 'Steep'}
          onClose={() => setPreview3D(null)}
        />
      )}
    </div>
  );
};

export default WhatIfSimulator;
