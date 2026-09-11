import type { WatershedCollection, WatershedFeature } from '../types';
import watershedsData from '../data/watersheds.geojson';

const collection = watershedsData as unknown as WatershedCollection;

export async function getWatersheds(): Promise<WatershedFeature[]> {
  return collection.features;
}

export async function getWatershedById(id: string): Promise<WatershedFeature | undefined> {
  return collection.features.find(f => f.properties.id === id);
}
