const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface PointAnalysisResult {
  lat: number;
  lng: number;
  radius_m: number;
  ndvi: { mean: number | null; min: number | null; max: number | null };
  ndwi: { mean: number | null; min: number | null; max: number | null };
  soil_moisture_index?: {
    vv_backscatter_db: number | null;
    relative_ssmi_pct: number | null;
    sensor: string;
    methodology: string;
  };
  lulc_dominant_class: string;
  lulc_class_percentages: Record<string, number>;
  source: 'live';
  dataset: string;
  spatial_resolution_m: number;
  computed_at: string;
}

export interface PointAnalysisError {
  error: string;
  message: string;
}

/** Calls the live Earth Engine point-buffer analysis endpoint for a given
 * location. Returns either a real result or a structured error — never
 * fabricates a fallback value. */
export async function getPointAnalysis(
  lat: number, lng: number, radiusM: 250 | 500 | 1000
): Promise<{ ok: true; data: PointAnalysisResult } | { ok: false; error: PointAnalysisError }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/earth-engine/point-analysis?lat=${lat}&lng=${lng}&radius=${radiusM}`,
      { signal: AbortSignal.timeout(180000) } // real observed EE latency can be ~2min
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: { error: data.error || 'error', message: data.message || `Server error (${res.status})` } };
    }
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      return { ok: false, error: { error: 'timeout', message: 'Satellite analysis timed out after 3 minutes.' } };
    }
    return { ok: false, error: { error: 'network_error', message: 'Could not reach the backend. Is it running on port 4000?' } };
  }
}
