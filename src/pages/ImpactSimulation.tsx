import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import CircleGeom from 'ol/geom/Circle';
import type { FeatureLike } from 'ol/Feature';
import { useSearchParams } from 'react-router-dom';

import { getGisLayers } from '../services/gisService';
import { getWatersheds } from '../services/watershedService';
import { getSlopeCategoryAt, getLandUseCategoryAt } from '../utils/whatIfScore';
import {
  runImpactSimulation, checkPlausibility,
  type SimulationInputs, type SimulationResult, type PlausibilityResult,
  type RainfallScenario, type SimulationPeriod,
} from '../utils/impactSimulation';
import type { CandidateInterventionType, GisFeature } from '../types';
import {
  FlaskConical, MapPin, Droplet, Waves, Sprout, ShieldAlert, TrendingUp,
  Info, Eye, EyeOff, HelpCircle, Users, IndianRupee,
} from 'lucide-react';

import 'ol/ol.css';

const CANDIDATE_TYPES: CandidateInterventionType[] = [
  'Check Dam', 'Farm Pond', 'Percolation Tank', 'Contour Bunding', 'Farm Bund',
];
const RAINFALL_OPTIONS: RainfallScenario[] = ['Below Normal', 'Normal', 'Above Normal'];
const PERIOD_OPTIONS: SimulationPeriod[] = [1, 5, 10];

const ImpactSimulation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);
  const olMap = useRef<Map | null>(null);
  const overlaySource = useRef<VectorSource>(new VectorSource());
  const gisFeaturesRef = useRef<GisFeature[]>([]);
  const watershedsRef = useRef<Awaited<ReturnType<typeof getWatersheds>>>([]);

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    searchParams.get('lat') && searchParams.get('lng')
      ? { lat: parseFloat(searchParams.get('lat')!), lng: parseFloat(searchParams.get('lng')!) }
      : null
  );
  const [type, setType] = useState<CandidateInterventionType>(
    (searchParams.get('type') as CandidateInterventionType) || 'Check Dam'
  );
  const [structureSize, setStructureSize] = useState(8);
  const [rainfall, setRainfall] = useState<RainfallScenario>('Normal');
  const [period, setPeriod] = useState<SimulationPeriod>(5);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [showAfter, setShowAfter] = useState(true);
  const [slopeCategory, setSlopeCategory] = useState<string>('—');
  const [landUseCategory, setLandUseCategory] = useState<string>('—');

  // ── Map setup (once) ────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([getGisLayers(), getWatersheds()]).then(([gisCollection, watersheds]) => {
      gisFeaturesRef.current = gisCollection.features;
      watershedsRef.current = watersheds;
      if (!mapRef.current || olMap.current) return;

      const format = new GeoJSON();
      const osmLayer = new TileLayer({ source: new OSM() });

      const backgroundSrc = new VectorSource({
        features: format.readFeatures(gisCollection, { featureProjection: 'EPSG:3857' }),
      });
      const backgroundLayer = new VectorLayer({
        source: backgroundSrc,
        style: (feature: FeatureLike) => {
          const props = feature.getProperties();
          if (props.layer_type === 'water_bodies') {
            return new Style({
              image: new CircleStyle({ radius: 5, fill: new Fill({ color: 'rgba(91,168,196,0.35)' }), stroke: new Stroke({ color: '#5BA8C4', width: 1 }) }),
            });
          }
          if (props.layer_type === 'drainage') {
            return new Style({ stroke: new Stroke({ color: 'rgba(44,110,142,0.45)', width: 1.5 }) });
          }
          return new Style();
        },
      });

      const overlayLayer = new VectorLayer({ source: overlaySource.current, zIndex: 50 });

      const map = new Map({
        target: mapRef.current,
        layers: [osmLayer, backgroundLayer, overlayLayer],
        view: new View({
          center: location ? fromLonLat([location.lng, location.lat]) : fromLonLat([77.5, 24.0]),
          zoom: location ? 12 : 6,
        }),
      });
      olMap.current = map;

      map.on('singleclick', (evt) => {
        const [lng, lat] = toLonLat(evt.coordinate);
        setLocation({ lat, lng });
        setResult(null); // require re-running simulation for the new point
        setPlausibility(null);
      });
    });

    return () => { olMap.current?.setTarget(undefined); olMap.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Marker + overlay circles sync ──────────────────────────────────────
  useEffect(() => {
    overlaySource.current.clear();
    if (!location) return;

    const center = fromLonLat([location.lng, location.lat]);
    const pointFeat = new Feature({ geometry: new Point(center) });
    pointFeat.setStyle(new Style({
      image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#2C6E8E' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
      zIndex: 10,
    }));
    overlaySource.current.addFeature(pointFeat);

    if (result && showAfter) {
      // Draw benefited-area circle first (larger, amber, dashed) so the
      // recharge-zone circle (smaller, green, solid) sits visibly on top.
      const benefited = new Feature({ geometry: new CircleGeom(center, result.benefitedAreaRadiusM) });
      benefited.setStyle(new Style({
        fill: new Fill({ color: 'rgba(201,123,74,0.18)' }),
        stroke: new Stroke({ color: '#C97B4A', width: 1.5, lineDash: [4, 4] }),
      }));
      const recharge = new Feature({ geometry: new CircleGeom(center, result.rechargeZoneRadiusM) });
      recharge.setStyle(new Style({
        fill: new Fill({ color: 'rgba(107,142,78,0.30)' }),
        stroke: new Stroke({ color: '#6B8E4E', width: 2 }),
      }));
      overlaySource.current.addFeature(benefited);
      overlaySource.current.addFeature(recharge);
    }
  }, [location, result, showAfter]);

  const canRun = location !== null;
  const [plausibility, setPlausibility] = useState<PlausibilityResult | null>(null);

  const handleRun = () => {
    if (!location) return;

    const plaus = checkPlausibility(location.lat, location.lng, watershedsRef.current);
    setPlausibility(plaus);
    if (!plaus.isValid) {
      // Refuse to show fabricated-looking numbers for a location nowhere
      // near any watershed this prototype actually models (a city, the
      // ocean, another state entirely, etc.) — clear the results instead.
      setResult(null);
      return;
    }

    const slope = getSlopeCategoryAt(location.lat, location.lng, gisFeaturesRef.current);
    const landUse = getLandUseCategoryAt(location.lat, location.lng, gisFeaturesRef.current);
    setSlopeCategory(slope);
    setLandUseCategory(landUse);

    const inputs: SimulationInputs = {
      type, structureSizeM: structureSize, rainfallScenario: rainfall, periodYears: period,
      slopeCategory: slope as SimulationInputs['slopeCategory'], landUseCategory: landUse,
    };
    setResult(runImpactSimulation(inputs));
    setShowAfter(true);
  };

  return (
    <div className="flex h-[calc(100vh-89px)] overflow-hidden bg-surface-card relative">
      {/* Sidebar */}
      <div className="w-96 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto z-10 p-4 space-y-4">
        <div>
          <h1 className="text-base font-bold text-text-dark flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary-600" />
            Impact Simulation
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Click a location on the map, choose a scenario, and run a scenario-based spatial
            impact estimate — not a hydrological model.
          </p>
        </div>

        <div className="bg-primary-50 border border-primary-100 rounded p-3 flex gap-2 text-xs text-primary-800">
          <MapPin className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
          <span>
            {location
              ? <>Selected: <strong>{location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E</strong></>
              : 'Click anywhere on the map to select a location.'}
          </span>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Intervention</label>
            <select
              value={type}
              onChange={e => { setType(e.target.value as CandidateInterventionType); setResult(null); }}
              className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm"
            >
              {CANDIDATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex justify-between">
              <span>Structure Height / Depth</span>
              <span className="text-primary-600 font-bold">{structureSize} m</span>
            </label>
            <input
              type="range" min={2} max={15} step={1}
              value={structureSize}
              onChange={e => { setStructureSize(Number(e.target.value)); setResult(null); }}
              className="w-full mt-1.5 accent-primary-600"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rainfall Scenario</label>
            <select
              value={rainfall}
              onChange={e => { setRainfall(e.target.value as RainfallScenario); setResult(null); }}
              className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm"
            >
              {RAINFALL_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Simulation Period</label>
            <select
              value={period}
              onChange={e => { setPeriod(Number(e.target.value) as SimulationPeriod); setResult(null); }}
              className="w-full mt-1 border border-gray-200 rounded px-2 py-1.5 text-sm"
            >
              {PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p} year{p > 1 ? 's' : ''}</option>)}
            </select>
          </div>

          <button
            onClick={handleRun}
            disabled={!canRun}
            className="w-full py-2.5 rounded bg-primary-600 hover:bg-primary-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-sm transition-colors"
          >
            Run Simulation
          </button>
        </div>

        {/* Out-of-range warning — refuses to show numbers far from any modeled watershed */}
        {plausibility && !plausibility.isValid && (
          <div className="bg-red-50 border border-red-200 rounded p-3 flex gap-2 text-xs text-red-700">
            <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <span>
              This location is <strong>{plausibility.distanceKm} km</strong> from the nearest modeled
              watershed ({plausibility.nearestWatershedName}). No results are shown — this prototype's
              GIS data has no meaningful coverage this far out, so any numbers here would not be
              genuine estimates. Click a location within roughly {15} km of a watershed shown on the
              Map View page.
            </span>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-3 pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-text-dark uppercase tracking-wide">Simulation Result</p>
              <button
                onClick={() => setShowAfter(v => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800"
              >
                {showAfter ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showAfter ? 'After Simulation' : 'Before (hidden)'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ResultCard icon={Droplet} label="Est. Water Retention" value={`${result.waterRetentionM3.toLocaleString()} m³`} sub="per season" color="primary" />
              <ResultCard icon={Sprout} label="Recharge Zone" value={`${result.rechargeZoneHa} ha`} sub="estimated" color="tertiary" />
              <ResultCard icon={Waves} label="Benefited Land" value={`${result.benefitedLandHa} ha`} sub="estimated" color="secondary" />
              <ResultCard icon={ShieldAlert} label="Flood Risk Reduction" value={`${result.floodRiskReductionPct}%`} sub="estimated" color="accent" />
            </div>

            {/* Rural-development translation — connects the technical hectare
                output above to what it actually means for rural households,
                which is the framing this problem statement's sponsoring
                ministry (Rural Development) is ultimately concerned with. */}
            <div className="bg-tertiary-50 border border-tertiary-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-tertiary-700 flex-shrink-0" />
                <span className="text-xs font-semibold text-tertiary-800 uppercase tracking-wide">Rural Development Impact</span>
              </div>
              <p className="text-2xl font-bold text-tertiary-800 mt-1">
                ~{result.estimatedHouseholdsBenefited} farming households
              </p>
              <p className="text-[11px] text-tertiary-700 mt-1">
                Estimated from {result.benefitedLandHa} ha ÷ India's average agricultural landholding size
                (1.08 ha, Agriculture Census of India 2015-16) — a rough translation to household impact,
                not a field survey.
              </p>
            </div>

            {/* Cost estimation — real cited MGNREGA unit-cost reference,
                applied only to structure types it genuinely applies to.
                Deliberately a wide range, not a false-precision single
                number, and carries an explicit inflation caveat since the
                source guideline is an older published document. */}
            <div className="bg-accent-50 border border-accent-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-accent-700 flex-shrink-0" />
                <span className="text-xs font-semibold text-accent-800 uppercase tracking-wide">Estimated Construction Cost</span>
              </div>
              {result.estimatedCostRangeINR ? (
                <p className="text-2xl font-bold text-accent-800 mt-1">
                  {formatINRLakh(result.estimatedCostRangeINR[0])} – {formatINRLakh(result.estimatedCostRangeINR[1])}
                </p>
              ) : (
                <p className="text-sm font-semibold text-accent-800 mt-1">Not available for this structure type</p>
              )}
              <p className="text-[11px] text-accent-700 mt-1 leading-relaxed">{result.costMethodologyNote}</p>
            </div>

            <div className="bg-surface-card rounded p-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Groundwater Impact
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                result.groundwaterImpact === 'High' ? 'bg-tertiary-100 text-tertiary-700' :
                result.groundwaterImpact === 'Moderate' ? 'bg-accent-100 text-accent-700' :
                'bg-gray-200 text-gray-600'
              }`}>
                {result.groundwaterImpact} potential — qualitative only
              </span>
            </div>

            <p className="text-xs text-gray-500">
              Over {period} year{period > 1 ? 's' : ''}: <strong>{result.cumulativeRetentionM3.toLocaleString()} m³</strong> cumulative
              retention (diminishing-return estimate, not a linear multiply).
            </p>

            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-primary-600 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" /> How was this calculated?
              </summary>
              <ul className="mt-2 space-y-1.5 text-gray-500 pl-1">
                {result.methodology.map((line, i) => <li key={i}>• {line}</li>)}
                <li>• Real inputs used: slope = <strong>{slopeCategory}</strong> (SRTM-derived), land use = <strong>{landUseCategory}</strong> (nearest classified zone)</li>
              </ul>
            </details>
          </div>
        )}

        <div className="border-t border-gray-200 pt-3 flex gap-2 text-xs text-accent-700 font-medium">
          <Info className="w-4 h-4 text-accent-500 flex-shrink-0 mt-0.5" />
          <span>
            Estimated / Simulated, not measured. This is a scenario-based spatial estimator using
            the Rational Method and real slope/land-use inputs — not a calibrated hydrological
            model. Groundwater impact is a qualitative category, deliberately not a precise figure.
          </span>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="w-full h-full" />
        {result && (
          <div className="absolute top-3 right-3 bg-white/95 rounded-lg shadow px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-tertiary-500/50 border border-tertiary-600 inline-block" /> Recharge zone</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-accent-500/40 border border-accent-500 border-dashed inline-block" /> Benefited area</div>
          </div>
        )}
      </div>
    </div>
  );
};

// Formats a rupee amount in the lakh convention Indian budgeting uses
// (1 lakh = 100,000), since raw digit strings are hard to read at this scale.
function formatINRLakh(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} lakh`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

interface ResultCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  color: 'primary' | 'tertiary' | 'secondary' | 'accent';
}
const ResultCard: React.FC<ResultCardProps> = ({ icon: Icon, label, value, sub, color }) => (
  <div className="bg-surface-card rounded-lg p-2.5">
    <div className="flex items-center gap-1.5 mb-1">
      <Icon className={`w-3.5 h-3.5 text-${color}-600`} />
      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
    <p className="text-lg font-bold text-text-dark leading-none">{value}</p>
    <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
  </div>
);

export default ImpactSimulation;
