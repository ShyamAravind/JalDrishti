import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import exifr from 'exifr';
import Tesseract from 'tesseract.js';
import {
  ScanLine, UploadCloud, MapPin, AlertTriangle, Layers, Building2,
  Map as MapIcon, RefreshCw, Eye, Satellite, Sparkles, Info,
  CheckCircle2, XCircle, AlertCircle, ShieldCheck,
} from 'lucide-react';
import { getWatersheds } from '../services/watershedService';
import { getGisLayers } from '../services/gisService';
import { getProjects } from '../services/projectService';
import { haversineM, nearestPolygonCategory } from '../utils/whatIfScore';
import { analyzeImageContent, type ImageContentAnalysis } from '../utils/imageContentAnalysis';
import { parseOcrText } from '../utils/ocrParser';
import { getPointAnalysis, type PointAnalysisResult } from '../services/pointAnalysisService';
import { evaluateFieldEvidence } from '../utils/evidenceValidationEngine';
import type { WatershedFeature, Project } from '../types';

import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point, Circle as CircleGeom } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import 'ol/ol.css';

interface ExtractedResult {
  lat: number;
  lng: number;
  altitude?: number | string;
  date?: string;
  time?: string;
  source: 'EXIF Metadata' | 'OCR Extracted' | 'Manual Selection';
  imageUrl: string;
  nearestWatershed: { name: string; district: string; distanceKm: number } | null;
  landUseCategory: string;
  nearbyProjects: { name: string; type: string; distanceM: number }[];
}

const RADIUS_OPTIONS = [250, 500, 1000] as const;

const GeoImageIntel: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'processing-exif' | 'processing-ocr' | 'no-gps' | 'error' | 'done'>('idle');
  const [result, setResult] = useState<ExtractedResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);

  const [contentAnalysis, setContentAnalysis] = useState<ImageContentAnalysis | null>(null);
  const [contentAnalysisStatus, setContentAnalysisStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle');

  const [satelliteContext, setSatelliteContext] = useState<PointAnalysisResult | null>(null);
  const [satelliteStatus, setSatelliteStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [satelliteError, setSatelliteError] = useState<string | null>(null);
  const [analysisRadius, setAnalysisRadius] = useState<250 | 500 | 1000>(500);

  const [watershedsList, setWatershedsList] = useState<WatershedFeature[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);

  useEffect(() => {
    Promise.all([getWatersheds(), getProjects()]).then(([ws, proj]) => {
      setWatershedsList(ws);
      setProjectsList(proj);
    });
  }, []);

  const validation = useMemo(() => {
    if (!result || (result.lat === 0 && result.lng === 0)) return null;
    return evaluateFieldEvidence({
      lat: result.lat,
      lng: result.lng,
      source: result.source,
      timestamp: result.date ? `${result.date} ${result.time || ''}` : undefined,
      watersheds: watershedsList,
      projects: projectsList,
      satelliteContext,
      imageInterventionGuess: contentAnalysis?.interventionGuess,
    });
  }, [result, watershedsList, projectsList, satelliteContext, contentAnalysis]);

  const mapRef = useRef<HTMLDivElement>(null);
  const olMap = useRef<Map | null>(null);
  const vectorSource = useRef<VectorSource | null>(null);

  useEffect(() => {
    return () => {
      if (olMap.current) { olMap.current.setTarget(undefined); olMap.current = null; }
    };
  }, []);

  const initMap = useCallback((lat: number, lng: number, interactive: boolean = false) => {
    if (!mapRef.current) return;
    if (olMap.current) olMap.current.setTarget(undefined);

    const source = new VectorSource();
    vectorSource.current = source;

    if (lat && lng) {
      const marker = new Feature({ geometry: new Point(fromLonLat([lng, lat])) });
      marker.setStyle(new Style({
        image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#E53E3E' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
      }));
      source.addFeature(marker);

      const radiusCircle = new Feature({ geometry: new CircleGeom(fromLonLat([lng, lat]), analysisRadius) });
      radiusCircle.setStyle(new Style({
        fill: new Fill({ color: 'rgba(44,110,142,0.1)' }),
        stroke: new Stroke({ color: '#2C6E8E', width: 1.5, lineDash: [4, 4] }),
      }));
      source.addFeature(radiusCircle);
    }

    const map = new Map({
      target: mapRef.current,
      layers: [new TileLayer({ source: new OSM() }), new VectorLayer({ source })],
      view: new View({ center: fromLonLat([lng || 78.9629, lat || 20.5937]), zoom: (lat && lng) ? 14 : 5 }),
      interactions: interactive ? undefined : [],
      controls: [],
    });

    if (interactive) {
      map.on('click', async (evt) => {
        const [newLng, newLat] = toLonLat(evt.coordinate);
        source.clear();
        const marker = new Feature({ geometry: new Point(evt.coordinate) });
        marker.setStyle(new Style({
          image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#E53E3E' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
        }));
        source.addFeature(marker);
        await fetchSpatialContext(newLat, newLng, 'Manual Selection', result?.imageUrl || '');
      });
    }

    olMap.current = map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.imageUrl, analysisRadius]);

  useEffect(() => {
    if (status === 'done' && result) {
      setTimeout(() => initMap(result.lat, result.lng, false), 100);
    } else if (status === 'no-gps') {
      setTimeout(() => initMap(20.5937, 78.9629, true), 100);
    }
  }, [status, result, initMap]);

  useEffect(() => {
    if (status === 'done' && result && result.lat && result.lng) {
      runSatelliteAnalysis(result.lat, result.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisRadius]);

  const runSatelliteAnalysis = async (lat: number, lng: number) => {
    setSatelliteStatus('loading');
    setSatelliteError(null);
    const outcome = await getPointAnalysis(lat, lng, analysisRadius);
    if (outcome.ok) {
      setSatelliteContext(outcome.data);
      setSatelliteStatus('done');
    } else {
      setSatelliteContext(null);
      setSatelliteStatus('error');
      setSatelliteError(outcome.error.message);
    }
  };

  const runContentAnalysis = async (imageUrl: string) => {
    setContentAnalysisStatus('analyzing');
    try {
      const analysis = await analyzeImageContent(imageUrl);
      setContentAnalysis(analysis);
      setContentAnalysisStatus('done');
    } catch {
      setContentAnalysis(null);
      setContentAnalysisStatus('error');
    }
  };

  const fetchSpatialContext = async (
    lat: number, lng: number, source: ExtractedResult['source'], imageUrl: string,
    altitude?: string | number, date?: string, time?: string
  ) => {
    try {
      const [watersheds, gisCollection, projects] = await Promise.all([
        getWatersheds(), getGisLayers(), getProjects(),
      ]);

      let nearestWatershed: ExtractedResult['nearestWatershed'] = null;
      let minWsDist = Infinity;
      (watersheds as WatershedFeature[]).forEach(ws => {
        const ring = ws.geometry.coordinates[0] as [number, number][];
        const centLng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        const centLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
        const d = haversineM([lng, lat], [centLng, centLat]);
        if (d < minWsDist) {
          minWsDist = d;
          nearestWatershed = { name: ws.properties.name, district: ws.properties.district, distanceKm: Math.round(d / 100) / 10 };
        }
      });

      const lulcFeatures = gisCollection.features.filter(f => f.properties.layer_type === 'lulc' || f.properties.layer_type === 'vegetation');
      const landUseCategory = nearestPolygonCategory([lng, lat], lulcFeatures, 'Unclassified');

      const nearbyProjects = (projects as Project[])
        .map(p => ({ name: p.name, type: p.type, distanceM: Math.round(haversineM([lng, lat], [p.lng, p.lat])) }))
        .filter(p => p.distanceM <= 15000)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 5);

      setResult({ lat, lng, imageUrl, nearestWatershed, landUseCategory, nearbyProjects, source, altitude, date, time });
      setStatus('done');

      runContentAnalysis(imageUrl);
      runSatelliteAnalysis(lat, lng);
    } catch (e) {
      setStatus('error');
    }
  };

  const processFile = useCallback(async (file: File) => {
    setStatus('processing-exif');
    setResult(null);
    setContentAnalysis(null);
    setContentAnalysisStatus('idle');
    setSatelliteContext(null);
    setSatelliteStatus('idle');
    setFileName(file.name);
    const imageUrl = URL.createObjectURL(file);

    try {
      const gps = await exifr.parse(file, true);

      if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
        const alt = gps.GPSAltitude || gps.altitude;
        const dateObj = gps.DateTimeOriginal || gps.CreateDate || gps.ModifyDate;
        let dateStr, timeStr;
        if (dateObj instanceof Date) { dateStr = dateObj.toLocaleDateString(); timeStr = dateObj.toLocaleTimeString(); }
        await fetchSpatialContext(gps.latitude, gps.longitude, 'EXIF Metadata', imageUrl, alt, dateStr, timeStr);
        return;
      }

      setStatus('processing-ocr');
      setOcrProgress(0);
      try {
        const ocrWithTimeout = async () => {
          const worker = await Tesseract.createWorker('eng', 1, {
            workerPath: '/tesseract/worker.min.js',
            corePath: '/tesseract/',
            langPath: '/tesseract/',
            logger: m => { if (m.status === 'recognizing text') setOcrProgress(m.progress); },
          });
          const { data: { text } } = await worker.recognize(imageUrl);
          await worker.terminate();
          return text;
        };
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OCR timed out after 20s')), 20000)
        );
        const text = await Promise.race([ocrWithTimeout(), timeout]);

        const parsed = parseOcrText(text);
        if (parsed.lat !== null && parsed.lng !== null) {
          await fetchSpatialContext(parsed.lat, parsed.lng, 'OCR Extracted', imageUrl, parsed.alt ?? undefined, parsed.date ?? undefined, parsed.time ?? undefined);
          return;
        }
      } catch (ocrError) {
        console.warn('OCR fallback failed — offering manual selection instead:', ocrError);
      }

      setResult({ imageUrl, source: 'Manual Selection', lat: 0, lng: 0, nearestWatershed: null, landUseCategory: '', nearbyProjects: [] });
      setStatus('no-gps');
      runContentAnalysis(imageUrl);

    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const buildCombinedInsight = (): string | null => {
    if (!contentAnalysis) return null;
    const parts: string[] = [];
    parts.push(
      contentAnalysis.interventionGuess !== 'Unknown'
        ? `Field imagery suggests a possible ${contentAnalysis.interventionGuess.toLowerCase()}.`
        : `Field imagery does not clearly indicate a specific structure type.`
    );
    if (result?.landUseCategory) {
      parts.push(`The surrounding GIS-classified land use is ${result.landUseCategory}.`);
    }
    if (satelliteStatus === 'done' && satelliteContext) {
      parts.push(
        `Satellite analysis within ${satelliteContext.radius_m}m shows ${satelliteContext.lulc_dominant_class.toLowerCase()} land cover dominant, ` +
        `with a mean NDVI of ${satelliteContext.ndvi.mean ?? 'unavailable'} and NDWI-based wetness proxy of ${satelliteContext.ndwi.mean ?? 'unavailable'}.`
      );
    } else if (satelliteStatus === 'error') {
      parts.push(`Satellite analysis is currently unavailable — this insight is based on field imagery and GIS context only.`);
    }
    return parts.join(' ');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary-100 flex items-center justify-center flex-shrink-0">
          <ScanLine className="w-5 h-5 text-secondary-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text-dark">Geo-Coded Image Intelligence</h1>
          <p className="text-xs text-gray-500">
            A geo-coded field photo becomes spatial evidence — location, image content, and live satellite/GIS context, combined.
          </p>
        </div>
      </div>

      {status === 'idle' && (
        <div
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:border-primary-300 transition-colors"
        >
          <UploadCloud className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-text-dark mb-1">Drop a geo-tagged image here, or</p>
          <label className="text-xs font-semibold text-primary-600 hover:text-primary-700 cursor-pointer underline">
            browse to upload
            <input type="file" accept="image/*" onChange={onFileChange} className="hidden" />
          </label>
          <p className="text-[11px] text-gray-400 mt-2">
            Location extraction (EXIF/OCR) and image content analysis run entirely in your browser — no photo is uploaded to any server.
          </p>
        </div>
      )}

      {status === 'processing-exif' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-primary-500 animate-spin" />
          <p className="text-sm font-semibold text-gray-700">Reading image metadata...</p>
        </div>
      )}

      {status === 'processing-ocr' && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col items-center gap-3">
          <ScanLine className="w-6 h-6 text-secondary-500 animate-pulse" />
          <p className="text-sm font-semibold text-gray-700">No EXIF GPS found — scanning image for visible coordinates (OCR)...</p>
          <div className="w-full max-w-md bg-gray-200 rounded-full h-2 mt-1">
            <div className="bg-secondary-500 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.round(ocrProgress * 100)}%` }} />
          </div>
        </div>
      )}

      {status === 'no-gps' && (
        <div className="space-y-4">
          <div className="bg-accent-50 border border-accent-200 rounded-lg p-4 flex gap-3 text-sm text-accent-700">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No GPS coordinates detected.</p>
              <p className="text-xs mt-1">Neither EXIF metadata nor visible on-image text yielded valid coordinates.</p>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-bold text-text-dark mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-500" /> Select Location Manually
            </h2>
            <p className="text-xs text-gray-500 mb-3">Click on the map to set the image location manually.</p>
            <div ref={mapRef} className="w-full h-[400px] rounded-lg border border-gray-300 overflow-hidden" />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          An error occurred while processing the image. Please try again.
        </div>
      )}

      {(status === 'done' || (status === 'no-gps' && contentAnalysisStatus !== 'idle')) && result && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Uploaded Geo-Coded Image</h2>
            <div className="flex justify-center bg-gray-100 rounded-lg p-2">
              <img src={result.imageUrl} alt={fileName} className="max-h-64 object-contain rounded" />
            </div>
          </div>

          {status === 'done' && (
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-primary-500" /> Location Detection
                </h2>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-semibold flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {result.source}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs font-semibold">Latitude</p><p className="font-mono text-gray-800">{result.lat.toFixed(6)}° N</p></div>
                <div><p className="text-gray-500 text-xs font-semibold">Longitude</p><p className="font-mono text-gray-800">{result.lng.toFixed(6)}° E</p></div>
                <div><p className="text-gray-500 text-xs font-semibold">Altitude</p><p className="text-gray-800">{result.altitude ? `${result.altitude} m` : 'N/A'}</p></div>
                <div><p className="text-gray-500 text-xs font-semibold">Date & Time</p><p className="text-gray-800">{result.date || 'N/A'} {result.time || ''}</p></div>
              </div>
            </div>
          )}

          {validation && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-text-dark uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary-600" /> Evidence Validation Engine
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">{validation.summary}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 font-semibold block uppercase">Evidence Trust Score</span>
                    <span className="text-xl font-bold text-text-dark">{validation.trustScore} <span className="text-xs text-gray-400 font-normal">/ 100</span></span>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    validation.confidenceLevel === 'High' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                    validation.confidenceLevel === 'Medium' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                    'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    {validation.confidenceLevel} Confidence
                  </span>
                </div>
              </div>

              {/* Inside Watershed Highlight */}
              <div className={`rounded-lg p-3 flex items-start gap-2.5 text-xs font-medium ${
                validation.insideWatershed ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {validation.insideWatershed ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                <div>
                  <span className="font-bold">Watershed Containment: {validation.insideWatershed ? 'VERIFIED INSIDE' : 'OUTSIDE BOUNDARY'}</span>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {validation.insideWatershed
                      ? `Point coordinates [${result.lat.toFixed(5)}°, ${result.lng.toFixed(5)}°] verified within official boundary of ${validation.watershedName || 'configured watershed'}.`
                      : `Coordinates lie outside registered watershed boundary polygon. Evidence flagged for audit review.`}
                  </p>
                </div>
              </div>

              {/* Verification Checklist */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Multi-Factor Evidence Audit</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {validation.checks.map((chk) => (
                    <div key={chk.id} className="border border-gray-100 bg-gray-50/70 rounded p-2.5 flex items-start gap-2 text-xs">
                      {chk.status === 'pass' && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />}
                      {chk.status === 'warn' && <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />}
                      {chk.status === 'fail' && <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />}
                      <div>
                        <span className="font-bold text-text-dark block">{chk.label}</span>
                        <span className="text-[11px] text-gray-500">{chk.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-4 h-4 text-tertiary-600" /> Image Observations
              </h2>
              <span className="text-[10px] font-bold text-tertiary-700 bg-tertiary-50 border border-tertiary-200 rounded-full px-2 py-0.5">IMAGE OBSERVATION</span>
            </div>
            {contentAnalysisStatus === 'analyzing' && <p className="text-xs text-gray-400 mt-2">Analyzing image content...</p>}
            {contentAnalysisStatus === 'error' && <p className="text-xs text-red-500 mt-2">Image content analysis failed for this file.</p>}
            {contentAnalysisStatus === 'done' && contentAnalysis && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-sm">
                  <div><p className="text-gray-500 text-xs font-semibold">Detected Structure/Type</p><p className="font-semibold text-gray-800">{contentAnalysis.interventionGuess}</p></div>
                  <div><p className="text-gray-500 text-xs font-semibold">Vegetation</p><p className="font-semibold text-gray-800">{contentAnalysis.vegetation}</p></div>
                  <div><p className="text-gray-500 text-xs font-semibold">Water Presence</p><p className="font-semibold text-gray-800">{contentAnalysis.waterPresence}</p></div>
                  <div><p className="text-gray-500 text-xs font-semibold">Possible Erosion</p><p className="font-semibold text-gray-800">{contentAnalysis.erosion}</p></div>
                  <div><p className="text-gray-500 text-xs font-semibold">Land Condition</p><p className="font-semibold text-gray-800">{contentAnalysis.landCondition}</p></div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                  {contentAnalysis.explanations.map((e, i) => <p key={i} className="text-xs text-gray-500">• {e}</p>)}
                </div>
                <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Method: {contentAnalysis.method}. Heuristic color-based analysis, not a trained ML classifier — no confidence score is fabricated.
                </p>
              </>
            )}
          </div>

          {status === 'done' && (
            <>
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <Satellite className="w-4 h-4 text-primary-600" /> Satellite Context (Earth Engine)
                  </h2>
                  <span className="text-[10px] font-bold text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-2 py-0.5">LIVE SATELLITE</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">Analysis radius:</span>
                  {RADIUS_OPTIONS.map(r => (
                    <button key={r} onClick={() => setAnalysisRadius(r)}
                      className={`text-xs px-2 py-0.5 rounded-full border ${analysisRadius === r ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-200 text-gray-600'}`}>
                      {r}m
                    </button>
                  ))}
                </div>

                {satelliteStatus === 'loading' && <p className="text-xs text-gray-400 mt-3">Running live Earth Engine analysis — can take up to 2-3 minutes...</p>}
                {satelliteStatus === 'error' && (
                  <p className="text-xs text-accent-700 mt-3">
                    Satellite analysis unavailable{satelliteError ? `: ${satelliteError}` : '.'} GIS context below still applies.
                  </p>
                )}
                {satelliteStatus === 'done' && satelliteContext && (
                  <>
                    <p className="text-xs text-gray-500 mt-3">Satellite context analyzed within {satelliteContext.radius_m}m of image location. Dataset: {satelliteContext.dataset}, {satelliteContext.spatial_resolution_m}m resolution.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                      <div><p className="text-gray-500 text-xs font-semibold">NDVI (mean)</p><p className="font-mono text-gray-800">{satelliteContext.ndvi.mean ?? 'N/A'}</p></div>
                      <div><p className="text-gray-500 text-xs font-semibold">NDWI Wetness Proxy</p><p className="font-mono text-gray-800">{satelliteContext.ndwi.mean ?? 'N/A'}</p></div>
                      <div><p className="text-gray-500 text-xs font-semibold">Radar Soil Moisture (SSMI)</p><p className="font-mono text-gray-800">{satelliteContext.soil_moisture_index?.relative_ssmi_pct !== undefined && satelliteContext.soil_moisture_index?.relative_ssmi_pct !== null ? `${satelliteContext.soil_moisture_index.relative_ssmi_pct}%` : 'N/A'}</p></div>
                      <div><p className="text-gray-500 text-xs font-semibold">Dominant LULC</p><p className="font-semibold text-gray-800">{satelliteContext.lulc_dominant_class}</p></div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary-500" /> GIS Context
                    </h2>
                    <span className="text-[10px] font-bold text-secondary-700 bg-secondary-50 border border-secondary-200 rounded-full px-2 py-0.5">GIS / REFERENCE DATA</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Watershed</span>
                      <span className="text-sm font-semibold text-gray-800 text-right">{result.nearestWatershed ? result.nearestWatershed.name : 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Land Use</span>
                      <span className="text-sm font-semibold text-gray-800 text-right">{result.landUseCategory}</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-secondary-500" /> Nearby Interventions
                    </p>
                    {result.nearbyProjects.length === 0 ? (
                      <p className="text-sm text-gray-400">No registered interventions within 15 km.</p>
                    ) : (
                      <ul className="space-y-2">
                        {result.nearbyProjects.map(p => (
                          <li key={p.name} className="text-sm text-text-dark flex justify-between bg-gray-50 p-2 rounded">
                            <span>{p.name} <span className="text-xs text-gray-500 ml-1">({p.type})</span></span>
                            <span className="text-xs font-semibold text-gray-600">{(p.distanceM / 1000).toFixed(1)} km</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <MapIcon className="w-4 h-4 text-primary-500" /> Map View
                  </h2>
                  <div ref={mapRef} className="w-full flex-grow min-h-[300px] rounded border border-gray-300 overflow-hidden" />
                </div>
              </div>

              {buildCombinedInsight() && (
                <div className="bg-tertiary-50 border border-tertiary-200 rounded-lg p-5">
                  <h2 className="text-sm font-bold text-tertiary-800 uppercase tracking-wider flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4" /> Combined Watershed Insight
                  </h2>
                  <p className="text-sm text-tertiary-900 leading-relaxed">{buildCombinedInsight()}</p>
                  <p className="text-[10px] text-tertiary-600 mt-2">
                    Generated deterministically from the observations above — not an AI-written summary. Recommendation Engine suitability scoring is available separately for this location.
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-center mt-6">
            <button
              onClick={() => { setStatus('idle'); setResult(null); setContentAnalysis(null); setSatelliteContext(null); }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded shadow-sm text-sm font-semibold transition-colors"
            >
              Process Another Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeoImageIntel;
