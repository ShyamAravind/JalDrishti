import React, { useEffect, useRef, useState, useCallback } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Cluster from 'ol/source/Cluster';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { Style, Fill, Stroke, Circle as CircleStyle, Text as OlText } from 'ol/style';
import { Draw } from 'ol/interaction';
import { getLength, getArea } from 'ol/sphere';
import Overlay from 'ol/Overlay';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import { boundingExtent } from 'ol/extent';
import { buffer as bufferExtent } from 'ol/extent';
import type { FeatureLike } from 'ol/Feature';

import { useFilterStore } from '../store/filterStore';
import FilterPanel from '../components/FilterPanel';
import ProjectSidePanel from '../components/ProjectSidePanel';

import { getProjects } from '../services/projectService';
import { getWatersheds } from '../services/watershedService';
import { getGisLayers } from '../services/gisService';
import { getGeoEvidence } from '../services/evidenceService';

import type { Project, GeoEvidence, WatershedFeature, LulcTrendEntry } from '../types';
import lulcTrendRaw from '../data/lulcTrend.json';

import {
  Layers, Ruler, GitCompare, X, ChevronDown, ChevronUp, Map as MapIcon, ToggleLeft, ToggleRight,
} from 'lucide-react';

import 'ol/ol.css';

const lulcTrend: LulcTrendEntry[] = lulcTrendRaw as LulcTrendEntry[];

// ── Colour constants matching JalDrishti palette ──────────────────────────────
const C = {
  primary:   '#2C6E8E',
  secondary: '#8B6844',
  tertiary:  '#6B8E4E',
  accent:    '#C97B4A',
  water:     '#5BA8C4',
};

const STATUS_FILL: Record<string, string> = {
  Completed: C.tertiary,
  Ongoing:   C.primary,
  Delayed:   C.accent,
};

const TYPE_SHAPE: Record<string, string> = {
  'Check Dam':         '⬟',
  'Farm Pond':         '◉',
  'Afforestation':     '▲',
  'Contour Trenching': '━',
};

// marker style factory — individual (non-clustered) markers
function projectStyle(project: Project, selected = false): Style {
  const fill = STATUS_FILL[project.status] ?? C.primary;
  return new Style({
    image: new CircleStyle({
      radius: selected ? 12 : 9,
      fill: new Fill({ color: fill }),
      stroke: new Stroke({ color: '#fff', width: selected ? 3 : 2 }),
    }),
    text: new OlText({
      text: TYPE_SHAPE[project.type] ?? '●',
      font: '10px sans-serif',
      fill: new Fill({ color: '#fff' }),
      offsetY: 0,
    }),
  });
}

// ── Cluster style factory ──────────────────────────────────────────────────────
function clusterStyle(size: number, isRisk: boolean): Style {
  const radius = Math.min(Math.max(size * 4 + 10, 14), 30);
  const color = isRisk ? C.accent : C.primary;
  return new Style({
    image: new CircleStyle({
      radius,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 2 }),
    }),
    text: new OlText({
      text: size.toString(),
      font: `bold ${radius > 20 ? 13 : 11}px sans-serif`,
      fill: new Fill({ color: '#fff' }),
    }),
  });
}

// GIS layer styles
function gisStyle(layerType: string, category: string): Style {
  switch (layerType) {
    case 'lulc':
      return new Style({
        fill: new Fill({
          color: category === 'Forest' ? 'rgba(107,142,78,0.25)' :
                 category === 'Agricultural' ? 'rgba(201,123,74,0.18)' :
                 'rgba(180,160,130,0.18)',
        }),
        stroke: new Stroke({ color: C.secondary, width: 1, lineDash: [4, 4] }),
      });
    case 'vegetation':
      return new Style({
        fill: new Fill({
          color: category === 'Dense Vegetation' ? 'rgba(46,92,36,0.38)' :
                 category === 'Sparse Vegetation' ? 'rgba(163,190,110,0.22)' :
                 'rgba(107,142,78,0.2)',
        }),
        stroke: new Stroke({
          color: category === 'Dense Vegetation' ? '#2E5C24' : C.tertiary,
          width: category === 'Dense Vegetation' ? 1.5 : 1,
        }),
      });
    case 'drainage':
      return new Style({
        stroke: new Stroke({ color: C.primary, width: 2, lineDash: [6, 3] }),
      });
    case 'water_bodies':
      return new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: C.water }),
          stroke: new Stroke({ color: '#fff', width: 1.5 }),
        }),
        fill: new Fill({ color: 'rgba(91,168,196,0.35)' }),
        stroke: new Stroke({ color: C.water, width: 1.5 }),
      });
    case 'slope':
      // Real SRTM-derived slope data (USGS/SRTMGL1_003 via Google Earth Engine) — see gisLayers.geojson note.
      return new Style({
        fill: new Fill({
          color: category === 'Flat'     ? 'rgba(139,104,68,0.08)' :
                 category === 'Gentle'   ? 'rgba(139,104,68,0.16)' :
                 category === 'Moderate' ? 'rgba(139,104,68,0.26)' :
                 'rgba(139,104,68,0.40)', // Steep
        }),
        stroke: new Stroke({ color: C.secondary, width: 1, lineDash: [2, 3] }),
      });
    case 'interventions':
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: C.secondary }),
          stroke: new Stroke({ color: '#fff', width: 1.5 }),
        }),
      });
    default:
      return new Style();
  }
}

// ── LULC fill for year-keyed comparison panes ─────────────────────────────────
/**
 * Returns a fill colour for a given lulc category in a specific year,
 * with opacity derived from the percentage value in lulcTrend.json so
 * the two comparison panes are visibly different.
 */
function lulcFillForYear(
  watershedId: string | undefined,
  year: number,
  category: string,
): string {
  const entry = lulcTrend.find(e => e.watershed_id === watershedId);
  if (!entry) {
    // Fallback to base style when no watershed is selected
    return category === 'Forest' ? 'rgba(107,142,78,0.25)'
         : category === 'Agricultural' ? 'rgba(201,123,74,0.18)'
         : 'rgba(180,160,130,0.18)';
  }

  const yearIdx = entry.years.indexOf(year);
  const idx = yearIdx >= 0 ? yearIdx : (year <= 2020 ? 0 : entry.years.length - 1);

  if (category === 'Forest') {
    const pct = entry.forest_pct[idx] ?? entry.forest_pct[0];
    const opacity = Math.min(0.7, Math.max(0.1, pct / 60));
    return `rgba(107,142,78,${opacity.toFixed(2)})`;
  }
  if (category === 'Agricultural') {
    const pct = entry.agricultural_pct[idx] ?? entry.agricultural_pct[0];
    const opacity = Math.min(0.7, Math.max(0.1, pct / 70));
    return `rgba(201,123,74,${opacity.toFixed(2)})`;
  }
  // Barren / other
  const pct = entry.barren_degraded_pct[idx] ?? entry.barren_degraded_pct[0];
  const opacity = Math.min(0.6, Math.max(0.08, pct / 40));
  return `rgba(180,160,130,${opacity.toFixed(2)})`;
}

function gisStyleForYear(
  layerType: string,
  category: string,
  watershedId: string | undefined,
  year: number,
): Style {
  if (layerType === 'lulc') {
    return new Style({
      fill: new Fill({ color: lulcFillForYear(watershedId, year, category) }),
      stroke: new Stroke({ color: C.secondary, width: 1, lineDash: [4, 4] }),
    });
  }
  return gisStyle(layerType, category);
}

// ── Layer panel toggle state ──────────────────────────────────────────────────
type LayerKey =
  | 'watershed'
  | 'lulc'
  | 'drainage'
  | 'vegetation'
  | 'water_bodies'
  | 'interventions'
  | 'slope'
  | 'soil_moisture'
  | 'land_degradation'
  | 'change_detection'
  | 'risk';

const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  watershed:        true,
  lulc:             true,
  drainage:         true,
  vegetation:       false,
  water_bodies:     true,
  interventions:    true,
  slope:            false,
  soil_moisture:    false,
  land_degradation: false,
  change_detection: false,
  risk:             true,
};

const LAYER_LABELS: Record<LayerKey, string> = {
  watershed:        'Watershed Boundaries',
  lulc:             'Land Use / Land Cover (LULC)',
  drainage:         'Drainage Network',
  vegetation:       'Vegetation Zones',
  water_bodies:     'Water Bodies',
  interventions:    'Existing Interventions',
  slope:            'Slope / Terrain (SRTM)',
  soil_moisture:    'Soil Moisture (Sentinel-1 SAR)',
  land_degradation: 'Land Degradation Indicator',
  change_detection: 'Temporal Change Detection',
  risk:             'Risk / Attention Areas',
};

const LAYER_PROVENANCE: Record<LayerKey, { tag: string; color: string; desc: string }> = {
  watershed:        { tag: 'CONFIGURED DATASET', color: 'bg-gray-100 text-gray-700', desc: 'Pre-configured watershed boundaries' },
  lulc:             { tag: 'LIVE / PROCESSED', color: 'bg-emerald-100 text-emerald-800', desc: 'Landsat 8/9 30m classification' },
  drainage:         { tag: 'CONFIGURED DATASET', color: 'bg-gray-100 text-gray-700', desc: 'Hydrological stream order vector' },
  vegetation:       { tag: 'LIVE / PROCESSED', color: 'bg-emerald-100 text-emerald-800', desc: 'Landsat/Sentinel vegetation density' },
  water_bodies:     { tag: 'CONFIGURED DATASET', color: 'bg-gray-100 text-gray-700', desc: 'Surface water reservoir inventory' },
  interventions:    { tag: 'DEMONSTRATION DATA', color: 'bg-amber-100 text-amber-800', desc: 'Demonstration intervention records' },
  slope:            { tag: 'PROCESSED SRTM', color: 'bg-purple-100 text-purple-800', desc: 'USGS/SRTMGL1_003 30m terrain model' },
  soil_moisture:    { tag: 'LIVE SENTINEL-1 SAR', color: 'bg-blue-100 text-blue-800', desc: 'Sentinel-1 C-band SAR soil moisture index' },
  land_degradation: { tag: 'LIVE SATELLITE', color: 'bg-rose-100 text-rose-800', desc: 'Satellite multi-criteria degradation risk' },
  change_detection: { tag: 'PROCESSED TEMPORAL', color: 'bg-teal-100 text-teal-800', desc: 'Multi-year spectral change difference' },
  risk:             { tag: 'COMPUTED HEURISTIC', color: 'bg-orange-100 text-orange-800', desc: 'Catchment risk & attention zones' },
};

// ── Dynamic Thematic Mapping ────────────────────────────────────────────────
type ThemeName = 'All Layers' | 'Water' | 'Land Use' | 'Vegetation' | 'Drainage' | 'Infrastructure' | 'Satellite Intelligence';

const THEME_PRESETS: Record<ThemeName, Record<LayerKey, boolean>> = {
  'All Layers': DEFAULT_LAYERS,
  'Water': {
    watershed: true, lulc: false, drainage: true, vegetation: false,
    water_bodies: true, interventions: false, slope: false,
    soil_moisture: true, land_degradation: false, change_detection: false, risk: false,
  },
  'Land Use': {
    watershed: true, lulc: true, drainage: false, vegetation: false,
    water_bodies: false, interventions: false, slope: false,
    soil_moisture: false, land_degradation: true, change_detection: false, risk: false,
  },
  'Vegetation': {
    watershed: true, lulc: false, drainage: false, vegetation: true,
    water_bodies: false, interventions: false, slope: false,
    soil_moisture: false, land_degradation: false, change_detection: true, risk: false,
  },
  'Drainage': {
    watershed: true, lulc: false, drainage: true, vegetation: false,
    water_bodies: false, interventions: false, slope: true,
    soil_moisture: false, land_degradation: false, change_detection: false, risk: false,
  },
  'Infrastructure': {
    watershed: true, lulc: false, drainage: false, vegetation: false,
    water_bodies: false, interventions: true, slope: false,
    soil_moisture: false, land_degradation: false, change_detection: false, risk: true,
  },
  'Satellite Intelligence': {
    watershed: true, lulc: true, drainage: true, vegetation: true,
    water_bodies: true, interventions: false, slope: true,
    soil_moisture: true, land_degradation: true, change_detection: true, risk: false,
  },
};

const THEME_NAMES = Object.keys(THEME_PRESETS) as ThemeName[];

// ── Basemap tinting per theme ────────────────────────────────────────────────
// Beyond toggling which vector overlays are visible, the base map tiles
// themselves shift color per theme, via a CSS filter applied to the OSM
// tile layer's rendered canvas — a real, immediate visual change tied to
// the selected theme rather than a static basemap.
const THEME_BASEMAP_FILTER: Record<ThemeName | 'Custom', string> = {
  'All Layers':      '',
  'Water':           'hue-rotate(180deg) saturate(1.5) brightness(0.95)',
  'Land Use':        'sepia(0.4) saturate(1.3) brightness(0.97)',
  'Vegetation':      'hue-rotate(70deg) saturate(1.6) brightness(0.92)',
  'Drainage':        'hue-rotate(195deg) saturate(1.7) contrast(1.1)',
  'Infrastructure':  'grayscale(0.65) contrast(1.15)',
  'Satellite Intelligence': 'saturate(1.2) contrast(1.05)',
  'Custom':          '',
};

type MeasureMode = 'none' | 'distance' | 'area';

// ── Component ─────────────────────────────────────────────────────────────────
const MapPage: React.FC = () => {
  const mapRef        = useRef<HTMLDivElement>(null);
  const olMap         = useRef<Map | null>(null);
  const tooltipRef    = useRef<HTMLDivElement>(null);
  const tooltipOverlay= useRef<Overlay | null>(null);
  const drawRef       = useRef<Draw | null>(null);
  const measureSrcRef = useRef<VectorSource | null>(null);

  // layer refs
  const layerRefs = useRef<Partial<Record<LayerKey, VectorLayer<VectorSource>>>>({});
  const nrscLayerRef = useRef<TileLayer<TileWMS> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const [satelliteVisible, setSatelliteVisible] = useState(false);
  const [nrscVisible, setNrscVisible] = useState(false);
  const [nrscStatus, setNrscStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const projectLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const riskLayerRef    = useRef<VectorLayer<VectorSource> | null>(null);

  // comparison map refs
  const leftMapRef  = useRef<HTMLDivElement>(null);
  const rightMapRef = useRef<HTMLDivElement>(null);
  const olLeftMap   = useRef<Map | null>(null);
  const olRightMap  = useRef<Map | null>(null);
  const compViewRef = useRef<View | null>(null);

  // state
  const [layersVisible, setLayersVisible] = useState(DEFAULT_LAYERS);
  const [selectedTheme, setSelectedTheme] = useState<ThemeName | 'Custom'>('All Layers');
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none');
  const [measureResult, setMeasureResult] = useState<string>('');
  const [projects, setProjects]   = useState<Project[]>([]);
  const [watersheds, setWatersheds] = useState<WatershedFeature[]>([]);
  const [evidence, setEvidence]   = useState<GeoEvidence[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<GeoEvidence | null>(null);
  const [comparisonMode, setComparisonMode] = useState(false);

  const { district, watershedId, status, projectType, searchQuery, setSelectedProjectId } = useFilterStore();

  // filtered projects
  const filtered = React.useMemo(() => {
    let list = projects;
    if (district)     list = list.filter(p => p.district === district);
    if (watershedId)  list = list.filter(p => p.watershed_id === watershedId);
    if (status)       list = list.filter(p => p.status === status);
    if (projectType)  list = list.filter(p => p.type === projectType);
    if (searchQuery)  list = list.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return list;
  }, [projects, district, watershedId, status, projectType, searchQuery]);

  // ── Init main map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || olMap.current) return;

    const osmLayer = new TileLayer({ source: new OSM(), className: 'jd-basemap' });

    // Real satellite imagery basemap — Esri World Imagery, a free public
    // tile service (no API key, no registration, no backend needed).
    // Genuine satellite/aerial photography, toggled via the "Satellite View"
    // switch below. Simpler and more reliably reachable than the NRSC WMS
    // service, which requires a live government server round-trip.
    const satelliteLayer = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Imagery © Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
      }),
      visible: false,
    });
    satelliteLayerRef.current = satelliteLayer;

    // ── Real NRSC/Bhuvan WMS thematic layer ──────────────────────────────────
    // Public OGC WMS service confirmed via NRSC's own Bhuvan Wiki
    // documentation (bhuvan.nrsc.gov.in/wiki -> "How to use WMS services").
    // No API key/login required for this service (unlike Bhoonidhi, which
    // requires an authenticated account — see the Satellite Data panel).
    //
    // URL, version and format below are confirmed from the official Bhuvan
    // Wiki documentation ("How to use WMS services"). The LAYERS value is
    // NOT yet confirmed for our specific watersheds: Bhuvan's LULC50K layers
    // are named per state + toposheet sheet number (e.g. Bihar uses
    // "lulc:BR_LULC50K_1112", Karnataka uses "lulc:KA_LULC50K_0506") — there
    // is no single universal layer name. Our 4 watersheds sit in Madhya
    // Pradesh (Morena, Balaghat) and Rajasthan (Tonk, Dungarpur), so the
    // correct values would follow an "MP_LULC50K_xxxx" / "RJ_LULC50K_xxxx"
    // pattern, but the exact sheet numbers need to be looked up on Bhuvan's
    // Thematic Services portal (https://bhuvan.nrsc.gov.in/gis/thematic/) —
    // that lookup needs a real browser session and hasn't been done yet.
    const nrscSource = new TileWMS({
      url: 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms',
      params: { LAYERS: 'lulc:BR_LULC50K_1112', VERSION: '1.1.1', FORMAT: 'image/png', TRANSPARENT: true },
      serverType: 'geoserver',
      crossOrigin: 'anonymous',
    });
    const nrscLayer = new TileLayer({ source: nrscSource, visible: false, opacity: 0.75 });
    nrscLayerRef.current = nrscLayer;

    nrscSource.on('tileloadstart', () => setNrscStatus('loading'));
    nrscSource.on('tileloadend', () => setNrscStatus('loaded'));
    nrscSource.on('tileloaderror', () => setNrscStatus('error'));

    tooltipOverlay.current = new Overlay({
      element: tooltipRef.current!,
      offset: [10, 0],
      positioning: 'bottom-left',
    });

    const map = new Map({
      target: mapRef.current,
      layers: [osmLayer, satelliteLayer, nrscLayer],
      view: new View({
        center: fromLonLat([77.5, 24.0]),
        zoom: 6,
      }),
      overlays: [tooltipOverlay.current],
    });

    olMap.current = map;

    const measureSrc = new VectorSource();
    measureSrcRef.current = measureSrc;
    const measureLayer = new VectorLayer({
      source: measureSrc,
      style: new Style({
        stroke: new Stroke({ color: '#C97B4A', width: 2, lineDash: [8, 4] }),
        fill: new Fill({ color: 'rgba(201,123,74,0.08)' }),
      }),
      zIndex: 200,
    });
    map.addLayer(measureLayer);

    return () => { map.setTarget(undefined); olMap.current = null; };
  }, []);

  // ── Load data and build GIS layers ───────────────────────────────────────
  useEffect(() => {
    Promise.all([getProjects(), getWatersheds(), getGisLayers(), getGeoEvidence()])
      .then(([projs, wsheds, gisCollection, evArr]) => {
        setProjects(projs);
        setWatersheds(wsheds);
        setEvidence(evArr);

        if (!olMap.current) return;
        const map = olMap.current;
        const format = new GeoJSON();

        // Watershed boundaries
        const wsSrc = new VectorSource({
          features: format.readFeatures(
            { type: 'FeatureCollection', features: wsheds },
            { featureProjection: 'EPSG:3857' }
          ),
        });
        const wsLayer = new VectorLayer({
          source: wsSrc,
          style: new Style({
            stroke: new Stroke({ color: C.primary, width: 2.5 }),
            fill: new Fill({ color: 'rgba(44,110,142,0.08)' }),
          }),
          zIndex: 1,
        });
        map.addLayer(wsLayer);
        layerRefs.current.watershed = wsLayer;

        // GIS layers by type
        const layerTypes: LayerKey[] = ['lulc', 'drainage', 'vegetation', 'water_bodies', 'interventions', 'slope'];
        for (const lt of layerTypes) {
          const feats = gisCollection.features.filter(f => f.properties.layer_type === lt);
          const src = new VectorSource({
            features: format.readFeatures(
              { type: 'FeatureCollection', features: feats },
              { featureProjection: 'EPSG:3857' }
            ),
          });
          const layer = new VectorLayer({
            source: src,
            style: (feature: FeatureLike) => {
              const props = feature.getProperties();
              return gisStyle(props.layer_type, props.category);
            },
            zIndex: lt === 'drainage' ? 5 : 3,
            visible: DEFAULT_LAYERS[lt],
          });
          map.addLayer(layer);
          layerRefs.current[lt] = layer;
        }

        // Live Sentinel-1 SAR Soil Moisture Index Layer
        const smSrc = new VectorSource({
          features: format.readFeatures(
            { type: 'FeatureCollection', features: wsheds },
            { featureProjection: 'EPSG:3857' }
          ),
        });
        const smLayer = new VectorLayer({
          source: smSrc,
          style: new Style({
            fill: new Fill({ color: 'rgba(37, 99, 235, 0.22)' }),
            stroke: new Stroke({ color: '#2563EB', width: 2, lineDash: [5, 3] }),
          }),
          zIndex: 4,
          visible: DEFAULT_LAYERS.soil_moisture,
        });
        map.addLayer(smLayer);
        layerRefs.current.soil_moisture = smLayer;

        // Satellite-Derived Land Degradation Indicator Layer
        const degFeats = gisCollection.features.filter(f =>
          (f.properties.layer_type === 'lulc' && f.properties.category === 'Barren/Degraded') ||
          (f.properties.layer_type === 'slope' && f.properties.category === 'Steep')
        );
        const degSrc = new VectorSource({
          features: format.readFeatures(
            { type: 'FeatureCollection', features: degFeats },
            { featureProjection: 'EPSG:3857' }
          ),
        });
        const degLayer = new VectorLayer({
          source: degSrc,
          style: new Style({
            fill: new Fill({ color: 'rgba(220, 38, 38, 0.28)' }),
            stroke: new Stroke({ color: '#DC2626', width: 1.5, lineDash: [3, 3] }),
          }),
          zIndex: 4,
          visible: DEFAULT_LAYERS.land_degradation,
        });
        map.addLayer(degLayer);
        layerRefs.current.land_degradation = degLayer;

        // Temporal Change Detection Layer
        const chgFeats = gisCollection.features.filter(f =>
          f.properties.layer_type === 'vegetation' ||
          (f.properties.layer_type === 'lulc' && f.properties.category === 'Forest')
        );
        const chgSrc = new VectorSource({
          features: format.readFeatures(
            { type: 'FeatureCollection', features: chgFeats },
            { featureProjection: 'EPSG:3857' }
          ),
        });
        const chgLayer = new VectorLayer({
          source: chgSrc,
          style: new Style({
            fill: new Fill({ color: 'rgba(13, 148, 136, 0.25)' }),
            stroke: new Stroke({ color: '#0D9488', width: 2 }),
          }),
          zIndex: 4,
          visible: DEFAULT_LAYERS.change_detection,
        });
        map.addLayer(chgLayer);
        layerRefs.current.change_detection = chgLayer;
      });
  }, []);

  // ── Build / refresh project cluster layers whenever filtered list changes ──
  useEffect(() => {
    if (!olMap.current) return;
    const map = olMap.current;

    // Remove old layers
    if (projectLayerRef.current) {
      map.removeLayer(projectLayerRef.current);
      projectLayerRef.current = null;
    }
    if (riskLayerRef.current) {
      map.removeLayer(riskLayerRef.current);
      riskLayerRef.current = null;
    }

    const evMap = new globalThis.Map<string, GeoEvidence>(evidence.map(e => [e.project_id, e]));

    // Build per-feature data
    const normalFeats: Feature<Point>[] = [];
    const riskFeats: Feature<Point>[] = [];

    filtered.forEach(proj => {
      const ev = evMap.get(proj.id);
      const isRisk = proj.status === 'Delayed' || (ev && ev.trust_score <= 2);
      const f = new Feature<Point>({ geometry: new Point(fromLonLat([proj.lng, proj.lat])) });
      f.setProperties({ projectId: proj.id, isRisk, _proj: proj });
      if (isRisk) {
        riskFeats.push(f);
      } else {
        normalFeats.push(f);
        f.setStyle(projectStyle(proj));
      }
    });

    // ── Normal cluster layer ──────────────────────────────────────────────
    const normalSrc = new VectorSource({ features: normalFeats });
    const normalCluster = new Cluster({ distance: 40, source: normalSrc });
    const projLayer = new VectorLayer({
      source: normalCluster as unknown as VectorSource,
      style: (feature: FeatureLike) => {
        const subFeatures = (feature as Feature).get('features') as Feature[];
        if (!subFeatures) return new Style();
        const count = subFeatures.length;
        if (count === 1) {
          // Delegate to the individual marker's pre-set style
          const inner = subFeatures[0];
          const proj = inner.get('_proj') as Project | undefined;
          return proj ? projectStyle(proj) : new Style();
        }
        return clusterStyle(count, false);
      },
      zIndex: 10,
      visible: layersVisible.interventions,
    });

    // ── Risk cluster layer ────────────────────────────────────────────────
    const riskSrc = new VectorSource({ features: riskFeats });
    const riskCluster = new Cluster({ distance: 40, source: riskSrc });
    const riskLayer = new VectorLayer({
      source: riskCluster as unknown as VectorSource,
      style: (feature: FeatureLike) => {
        const subFeatures = (feature as Feature).get('features') as Feature[];
        if (!subFeatures) return new Style();
        const count = subFeatures.length;
        if (count === 1) {
          return new Style({
            image: new CircleStyle({
              radius: 11,
              fill: new Fill({ color: C.accent }),
              stroke: new Stroke({ color: '#fff', width: 2.5 }),
            }),
            text: new OlText({
              text: '!',
              font: 'bold 11px sans-serif',
              fill: new Fill({ color: '#fff' }),
            }),
          });
        }
        return clusterStyle(count, true);
      },
      zIndex: 11,
      visible: layersVisible.risk,
    });

    map.addLayer(projLayer);
    map.addLayer(riskLayer);
    projectLayerRef.current = projLayer;
    riskLayerRef.current = riskLayer;
    layerRefs.current.risk = riskLayer;

    // ── Click handler ─────────────────────────────────────────────────────
    const clickKey = map.on('singleclick', (evt) => {
      map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        const subFeatures = (feature as Feature).get('features') as Feature[] | undefined;
        if (!subFeatures || subFeatures.length === 0) return;

        if (subFeatures.length > 1) {
          // Zoom to cluster extent
          const coords = subFeatures
            .map(f => (f.getGeometry() as Point | undefined)?.getCoordinates())
            .filter((c): c is number[] => Boolean(c));
          if (coords.length > 0) {
            const ext = bufferExtent(boundingExtent(coords), 20000);
            map.getView().fit(ext, { duration: 400 });
          }
          return true;
        }

        // Single feature — open side panel
        const inner = subFeatures[0];
        const id = inner.get('projectId') as string | undefined;
        if (id) {
          const proj = filtered.find(p => p.id === id);
          if (proj) {
            setSelectedProject(proj);
            setSelectedProjectId(proj.id);
            const ev = evidence.find(e => e.project_id === proj.id) ?? null;
            setSelectedEvidence(ev);
          }
          return true;
        }
      });
    });

    return () => {
      // Clean up listener — OL event key unlistening
      const listener = (clickKey as unknown as { listener: () => void }).listener;
      if (listener) map.un('singleclick', listener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, evidence]);

  // ── Zoom map to filtered results whenever an active filter narrows the set ─
  // Only auto-zooms when a filter is actually applied (district/watershed/
  // status/type/search) — the default unfiltered view stays under the
  // user's own pan/zoom control, exactly as before.
  useEffect(() => {
    if (!olMap.current) return;
    const anyFilterActive = Boolean(district || watershedId || status || projectType || searchQuery);
    if (!anyFilterActive) return;
    if (filtered.length === 0) return; // nothing to fit to — leave the view as-is

    const coords = filtered.map(p => fromLonLat([p.lng, p.lat]));
    const extent = filtered.length === 1
      ? bufferExtent(boundingExtent(coords), 5000) // single result: buffer so it isn't a zero-size fit
      : boundingExtent(coords);

    olMap.current.getView().fit(extent, {
      padding: [80, 80, 80, 80],
      maxZoom: 14,
      duration: 500,
    });
  }, [filtered, district, watershedId, status, projectType, searchQuery]);

  // ── Layer visibility sync ─────────────────────────────────────────────────
  useEffect(() => {
    (Object.keys(layersVisible) as LayerKey[]).forEach(key => {
      const layer = layerRefs.current[key];
      if (layer) layer.setVisible(layersVisible[key]);
    });
    // Project markers use a dedicated ref (not layerRefs.current.interventions)
    // because that key is already used by a separate, smaller GIS-sourced
    // "interventions" layer — sharing one ref slot would silently break
    // whichever layer registered second. Both still respond to the same
    // theme/checkbox toggle value, just via two independent refs.
    projectLayerRef.current?.setVisible(layersVisible.interventions);
  }, [layersVisible]);

  // ── Comparison map setup / teardown ──────────────────────────────────────
  useEffect(() => {
    if (!comparisonMode) {
      // Tear down comparison maps
      if (olLeftMap.current)  { olLeftMap.current.setTarget(undefined);  olLeftMap.current = null; }
      if (olRightMap.current) { olRightMap.current.setTarget(undefined); olRightMap.current = null; }
      compViewRef.current = null;
      return;
    }

    if (!leftMapRef.current || !rightMapRef.current) return;

    // Shared view — centre on the same position as main map (or default)
    const mainCenter = olMap.current?.getView().getCenter() ?? fromLonLat([77.5, 24.0]);
    const mainZoom   = olMap.current?.getView().getZoom() ?? 7;

    const sharedView = new View({
      center: mainCenter,
      zoom: mainZoom,
      minZoom: 4,
      maxZoom: 18,
    });
    compViewRef.current = sharedView;

    const format = new GeoJSON();

    function buildCompMap(target: HTMLDivElement, year: number): Map {
      const osm = new TileLayer({ source: new OSM() });

      // Watershed boundaries
      const wsSrc = new VectorSource({
        features: format.readFeatures(
          { type: 'FeatureCollection', features: watersheds },
          { featureProjection: 'EPSG:3857' }
        ),
      });
      const wsLayer = new VectorLayer({
        source: wsSrc,
        style: new Style({
          stroke: new Stroke({ color: C.primary, width: 2.5 }),
          fill: new Fill({ color: 'rgba(44,110,142,0.08)' }),
        }),
        zIndex: 1,
      });

      // LULC layer with year-keyed colours
      // We'll need the gisLayers here — fetch inline from already-loaded data
      // Since evidence/projects are loaded async, we store gisCollection in a ref
      const gisFeats = gisLayersCacheRef.current;
      const lulcSrc = new VectorSource({
        features: gisFeats
          ? format.readFeatures(
              {
                type: 'FeatureCollection',
                features: gisFeats.filter(f => f.properties.layer_type === 'lulc'),
              },
              { featureProjection: 'EPSG:3857' }
            )
          : [],
      });
      const lulcLayer = new VectorLayer({
        source: lulcSrc,
        style: (feature: FeatureLike) => {
          const props = feature.getProperties();
          return gisStyleForYear(props.layer_type, props.category, props.watershed_id, year);
        },
        zIndex: 3,
      });

      // Drainage
      const drainSrc = new VectorSource({
        features: gisFeats
          ? format.readFeatures(
              {
                type: 'FeatureCollection',
                features: gisFeats.filter(f => f.properties.layer_type === 'drainage'),
              },
              { featureProjection: 'EPSG:3857' }
            )
          : [],
      });
      const drainLayer = new VectorLayer({
        source: drainSrc,
        style: new Style({
          stroke: new Stroke({ color: C.primary, width: 2, lineDash: [6, 3] }),
        }),
        zIndex: 5,
      });

      return new Map({
        target,
        view: sharedView,
        layers: [osm, wsLayer, lulcLayer, drainLayer],
      });
    }

    olLeftMap.current  = buildCompMap(leftMapRef.current,  2020);
    olRightMap.current = buildCompMap(rightMapRef.current, 2026);

    return () => {
      if (olLeftMap.current)  { olLeftMap.current.setTarget(undefined);  olLeftMap.current = null; }
      if (olRightMap.current) { olRightMap.current.setTarget(undefined); olRightMap.current = null; }
      compViewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonMode, watersheds]);

  // ── Measure tool ──────────────────────────────────────────────────────────
  const startMeasure = useCallback((mode: MeasureMode) => {
    if (!olMap.current || !measureSrcRef.current) return;
    const map = olMap.current;

    if (drawRef.current) { map.removeInteraction(drawRef.current); drawRef.current = null; }
    measureSrcRef.current.clear();
    setMeasureResult('');

    if (mode === 'none') { setMeasureMode('none'); return; }

    const geomType = mode === 'distance' ? 'LineString' : 'Polygon';
    const draw = new Draw({ source: measureSrcRef.current, type: geomType });
    drawRef.current = draw;
    map.addInteraction(draw);
    setMeasureMode(mode);

    draw.on('drawend', (evt) => {
      const geom = evt.feature.getGeometry();
      if (!geom) return;
      let result = '';
      if (mode === 'distance') {
        const len = getLength(geom as import('ol/geom').LineString, { projection: 'EPSG:3857' });
        result = len > 1000
          ? `${(len / 1000).toFixed(2)} km`
          : `${Math.round(len)} m`;
      } else {
        const area = getArea(geom as import('ol/geom').Polygon, { projection: 'EPSG:3857' });
        result = area > 1_000_000
          ? `${(area / 1_000_000).toFixed(2)} km²`
          : `${Math.round(area)} m²`;
      }
      setMeasureResult(result);
      map.removeInteraction(draw);
      drawRef.current = null;
      setMeasureMode('none');
    });
  }, []);

  const toggleLayer = (key: LayerKey) => {
    setLayersVisible(prev => ({ ...prev, [key]: !prev[key] }));
    setSelectedTheme('Custom'); // manual toggle diverges from the selected preset
  };

  const applyTheme = (theme: ThemeName) => {
    setLayersVisible(THEME_PRESETS[theme]);
    setSelectedTheme(theme);
  };

  // Apply the basemap tint whenever the theme changes. Queried by class
  // name (set via TileLayer's `className` option above) rather than kept
  // as a stored element ref, since OpenLayers manages that DOM node itself.
  useEffect(() => {
    const basemapEl = mapRef.current?.querySelector('.jd-basemap') as HTMLElement | null;
    if (basemapEl) {
      basemapEl.style.filter = THEME_BASEMAP_FILTER[selectedTheme] ?? '';
      basemapEl.style.transition = 'filter 0.4s ease';
    }
  }, [selectedTheme]);

  const toggleNrscLayer = () => {
    const next = !nrscVisible;
    setNrscVisible(next);
    nrscLayerRef.current?.setVisible(next);
    if (next && nrscStatus === 'idle') setNrscStatus('loading');
  };

  const toggleSatelliteLayer = () => {
    const next = !satelliteVisible;
    setSatelliteVisible(next);
    satelliteLayerRef.current?.setVisible(next);
  };

  // ── GIS layers cache ref (populated in load effect) ───────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gisLayersCacheRef = useRef<any[] | null>(null);

  // Store gisLayers when loaded so comparison maps can use them
  useEffect(() => {
    getGisLayers().then(col => {
      gisLayersCacheRef.current = col.features;
    });
  }, []);

  return (
    <div className="flex h-[calc(100vh-89px)] overflow-hidden bg-surface-card relative">

      {/* Left sidebar */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto z-10">

        {/* Dynamic Thematic Mapping */}
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Theme</p>
          <div className="flex flex-wrap gap-1.5">
            {THEME_NAMES.map(theme => (
              <button
                key={theme}
                onClick={() => applyTheme(theme)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                  selectedTheme === theme
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-primary-300'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
          {selectedTheme === 'Custom' && (
            <p className="text-[10px] text-gray-400 mt-1.5">Custom layer combination (manually adjusted)</p>
          )}
        </div>

        {/* Real satellite imagery basemap — simple, reliable, no auth */}
        <div className="border-b border-gray-200 px-4 py-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={satelliteVisible}
              onChange={toggleSatelliteLayer}
              className="accent-primary-500 w-3.5 h-3.5"
            />
            <span className="text-xs font-semibold text-text-dark">Satellite View (Esri, real imagery)</span>
          </label>
          {satelliteVisible && (
            <p className="text-[11px] text-gray-400 mt-1.5">
              Real satellite/aerial imagery — © Esri, Maxar, Earthstar Geographics
            </p>
          )}
        </div>

        {/* Real NRSC/Bhuvan satellite/thematic overlay */}
        <div className="border-b border-gray-200 px-4 py-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={nrscVisible}
              onChange={toggleNrscLayer}
              className="accent-primary-500 w-3.5 h-3.5"
            />
            <span className="text-xs font-semibold text-text-dark">Live NRSC/Bhuvan Overlay</span>
          </label>

          {nrscVisible && (
            <div className="mt-2 text-[11px] space-y-1">
              <p className="text-gray-500">
                <span className="font-semibold">Source:</span> NRSC/ISRO Bhuvan (public WMS)
              </p>
              {nrscStatus === 'loading' && (
                <p className="text-primary-600 font-medium">● Requesting live tiles…</p>
              )}
              {nrscStatus === 'loaded' && (
                <p className="text-tertiary-600 font-medium">● Live tiles loaded</p>
              )}
              {nrscStatus === 'error' && (
                <p className="text-accent-600 font-medium">
                  ● Live service unavailable right now — showing base map only. This is a real external
                  government service call, not a simulated layer; availability can vary.
                </p>
              )}
              <a
                href="https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms?service=WMS&request=GetCapabilities"
                target="_blank" rel="noreferrer"
                className="text-primary-600 underline block"
              >
                Verify endpoint / view raw capabilities ↗
              </a>
            </div>
          )}
        </div>

        {/* Layer toggle panel */}
        <div className="border-b border-gray-200">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text-dark hover:bg-surface-card"
            onClick={() => setLayerPanelOpen(v => !v)}
          >
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-primary-600" />
              </div>
              Layers
            </span>
            {layerPanelOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {layerPanelOpen && (
            <div className="px-3 pb-3 space-y-2">
              {(Object.keys(DEFAULT_LAYERS) as LayerKey[]).map(key => (
                <label key={key} className="flex items-center justify-between gap-2 cursor-pointer group py-0.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={layersVisible[key]}
                      onChange={() => toggleLayer(key)}
                      className="accent-primary-500 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-gray-700 group-hover:text-text-dark font-medium">
                      {LAYER_LABELS[key]}
                    </span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${LAYER_PROVENANCE[key]?.color || 'bg-gray-100 text-gray-600'}`}>
                    {LAYER_PROVENANCE[key]?.tag}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Filter panel */}
        <div className="border-b border-gray-200">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-text-dark hover:bg-surface-card"
            onClick={() => setFilterPanelOpen(v => !v)}
          >
            <span className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-secondary-100 flex items-center justify-center">
                <MapIcon className="w-3.5 h-3.5 text-secondary-600" />
              </div>
              Filters
            </span>
            {filterPanelOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {filterPanelOpen && (
            <div className="px-3 pb-3">
              <FilterPanel watersheds={watersheds.map(w => ({
                id: w.properties.id,
                name: w.properties.name,
                district: w.properties.district,
              }))} />
            </div>
          )}
        </div>

        {/* Measure tools */}
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
            <Ruler className="w-3.5 h-3.5" /> Measure Tool
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => startMeasure(measureMode === 'distance' ? 'none' : 'distance')}
              className={`flex-1 text-xs py-1.5 rounded border font-medium transition-colors ${
                measureMode === 'distance'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600'
              }`}
            >
              Distance
            </button>
            <button
              onClick={() => startMeasure(measureMode === 'area' ? 'none' : 'area')}
              className={`flex-1 text-xs py-1.5 rounded border font-medium transition-colors ${
                measureMode === 'area'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600'
              }`}
            >
              Area
            </button>
          </div>
          {measureMode !== 'none' && (
            <p className="text-xs text-accent-600 mt-1.5 font-medium">
              Click to draw — double-click to finish
            </p>
          )}
          {measureResult && (
            <div className="mt-2 bg-primary-50 border border-primary-200 rounded px-2 py-1.5 text-sm font-bold text-primary-700 flex items-center justify-between">
              <span>{measureResult}</span>
              <button onClick={() => { setMeasureResult(''); measureSrcRef.current?.clear(); }}>
                <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          )}
        </div>

        {/* Map Comparison toggle */}
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
            <GitCompare className="w-3.5 h-3.5" /> Map Comparison
          </p>
          <button
            onClick={() => setComparisonMode(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded border text-xs font-semibold transition-all ${
              comparisonMode
                ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                : 'border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600'
            }`}
          >
            <span>{comparisonMode ? 'Comparison ON — 2020 vs 2026' : 'Enable 2020 / 2026 Comparison'}</span>
            {comparisonMode
              ? <ToggleRight className="w-4 h-4 flex-shrink-0" />
              : <ToggleLeft  className="w-4 h-4 flex-shrink-0 text-gray-400" />}
          </button>
          <p className="text-xs text-gray-400 mt-1.5 leading-snug italic">
            {comparisonMode
              ? 'Both panes share the same pan/zoom. LULC fill reflects classified data for each year.'
              : 'Split-screen view comparing LULC layers across years.'}
          </p>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 mt-auto border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Legend</p>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium">Status</p>
            {[
              { color: C.tertiary, label: 'Completed' },
              { color: C.primary, label: 'Ongoing' },
              { color: C.accent,  label: 'Delayed' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
            <p className="text-xs text-gray-500 font-medium mt-2">Intervention Type</p>
            {Object.entries(TYPE_SHAPE).map(([type, shape]) => (
              <div key={type} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="w-4 text-center text-gray-700 font-bold">{shape}</span>
                {type}
              </div>
            ))}
            <div className="flex items-center gap-2 text-xs text-accent-700 mt-1 font-medium">
              <div className="w-3 h-3 rounded-full bg-accent-500 flex items-center justify-center">
                <span className="text-white font-bold" style={{ fontSize: 7 }}>!</span>
              </div>
              Risk / Attention
            </div>
            <div className="flex items-center gap-2 text-xs text-primary-700 mt-1 font-medium">
              <div className="w-4 h-4 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold" style={{ fontSize: 8 }}>3</span>
              </div>
              Cluster (count)
            </div>
          </div>
        </div>
      </div>

      {/* Map container — normal OR comparison */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        {comparisonMode ? (
          <>
            {/* Split-screen comparison */}
            <div className="flex-1 flex flex-row">
              {/* Left pane — 2020 */}
              <div className="flex-1 relative border-r border-white/60">
                <div ref={leftMapRef} className="w-full h-full" />
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary-700/90 text-white text-xs font-bold px-3 py-1 rounded-full shadow pointer-events-none">
                  2020
                </div>
              </div>
              {/* Right pane — 2026 */}
              <div className="flex-1 relative">
                <div ref={rightMapRef} className="w-full h-full" />
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-accent-600/90 text-white text-xs font-bold px-3 py-1 rounded-full shadow pointer-events-none">
                  2026
                </div>
              </div>
            </div>
            {/* Disclaimer caption */}
            <div className="flex-shrink-0 bg-white/95 border-t border-gray-200 px-4 py-1.5 text-[11px] text-gray-400 italic text-center">
              Comparison based on available classified layers — not live satellite imagery.
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 relative">
              <div ref={mapRef} className="w-full h-full" />

              {/* Floating marker count */}
              <div className="absolute top-3 right-3 bg-white/90 border border-gray-200 rounded-lg px-3 py-2 shadow text-xs z-10">
                <span className="font-semibold text-primary-700">{filtered.length}</span>
                <span className="text-gray-500"> / {projects.length} interventions shown</span>
              </div>

              {/* Tooltip element (managed by OL Overlay) */}
              <div ref={tooltipRef} className="hidden" />
            </div>
          </>
        )}
      </div>

      {/* Project side panel */}
      <ProjectSidePanel
        project={selectedProject}
        evidence={selectedEvidence}
        onClose={() => {
          setSelectedProject(null);
          setSelectedEvidence(null);
          setSelectedProjectId(null);
        }}
      />
    </div>
  );
};

export default MapPage;
