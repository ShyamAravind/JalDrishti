import type { GisLayerCollection, GisFeature, GisLayerType } from '../types';
import gisLayersData from '../data/gisLayers.geojson';
import type { LulcTrendEntry } from '../types';
import lulcTrendData from '../data/lulcTrend.json';

const gisCollection = gisLayersData as unknown as GisLayerCollection;
const lulcTrend = lulcTrendData as LulcTrendEntry[];

export async function getGisLayers(): Promise<GisLayerCollection> {
  return gisCollection;
}

export async function getGisFeaturesByType(layerType: GisLayerType): Promise<GisFeature[]> {
  return gisCollection.features.filter(f => f.properties.layer_type === layerType);
}

export async function getGisFeaturesByWatershed(watershedId: string): Promise<GisFeature[]> {
  return gisCollection.features.filter(f => f.properties.watershed_id === watershedId);
}

export async function getLulcTrend(): Promise<LulcTrendEntry[]> {
  return lulcTrend;
}

export async function getLulcTrendByWatershed(watershedId: string): Promise<LulcTrendEntry | undefined> {
  return lulcTrend.find(e => e.watershed_id === watershedId);
}
