import type {
  SatelliteStatusResponse,
  Sentinel1SoilMoistureResult,
  TemporalChangeResult,
  LandDegradationResult,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function getSatelliteStatus(): Promise<SatelliteStatusResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/earth-engine/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[satelliteService] Unable to reach backend status:', err);
    return null;
  }
}

export async function getSentinel1SoilMoisture(
  watershedId: string,
  options?: {
    beforeStart?: string;
    beforeEnd?: string;
    afterStart?: string;
    afterEnd?: string;
  }
): Promise<{ ok: true; data: Sentinel1SoilMoistureResult } | { ok: false; error: string }> {
  try {
    const params = new URLSearchParams();
    if (options?.beforeStart) params.set('beforeStart', options.beforeStart);
    if (options?.beforeEnd) params.set('beforeEnd', options.beforeEnd);
    if (options?.afterStart) params.set('afterStart', options.afterStart);
    if (options?.afterEnd) params.set('afterEnd', options.afterEnd);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/earth-engine/soil-moisture/${watershedId}${queryStr}`);
    const data = await res.json();

    if (!res.ok) {
      return { ok: false, error: data.message || `Server error (${res.status})` };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: 'Cannot reach backend server. Ensure backend is running (cd server && npm run dev).',
    };
  }
}

export async function getTemporalChange(
  watershedId: string,
  beforeYear: number = 2020,
  afterYear: number = 2024
): Promise<{ ok: true; data: TemporalChangeResult } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/earth-engine/change-detection/${watershedId}?beforeYear=${beforeYear}&afterYear=${afterYear}`
    );
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message || `Server error (${res.status})` };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: 'Cannot reach backend server. Ensure backend is running.',
    };
  }
}

export async function getLandDegradation(
  watershedId: string,
  year: number = new Date().getFullYear()
): Promise<{ ok: true; data: LandDegradationResult } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/earth-engine/land-degradation/${watershedId}?year=${year}`);
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.message || `Server error (${res.status})` };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: 'Cannot reach backend server. Ensure backend is running.',
    };
  }
}
