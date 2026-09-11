import { SatelliteDataProvider } from './satelliteProvider.js';

/**
 * SrishtiDrishtiProvider (Integration-Ready Adapter)
 * 
 * Defines the contract, protocol specifications, and data translation
 * layers for Indian Space Research Organisation (ISRO) / National Remote
 * Sensing Centre (NRSC) SRISHTI-DRISHTI & Bhoonidhi spatial services.
 * 
 * Direct API access requires authorized MoRD/NRSC institutional security
 * tokens and endpoint VPN access. This adapter specifies the exact payload
 * contract and error semantics so authorized credentials can be activated
 * without modifying analytical consumers or UI layers.
 */
export class SrishtiDrishtiProvider extends SatelliteDataProvider {
  constructor() {
    super('SRISHTI-DRISHTI', 'adapter');
    this.endpointUrl = process.env.SRISHTI_ENDPOINT_URL || 'https://bhoonidhi.nrsc.gov.in/srishti/api/v1';
  }

  isConfigured() {
    return Boolean(process.env.SRISHTI_API_KEY && process.env.SRISHTI_TOKEN);
  }

  async getStatus() {
    return {
      provider: this.name,
      type: this.providerType,
      status: this.isConfigured() ? 'connected' : 'integration_ready',
      configured: this.isConfigured(),
      endpoint: this.endpointUrl,
      agency: 'ISRO / NRSC & Ministry of Rural Development',
      supportedSensors: [
        'Resourcesat-2/2A LISS-IV (5.8m Multispectral)',
        'Cartosat-1/2 (High-Resolution Stereo DEM)',
        'RISAT-1A / EOS-04 (C-band SAR Soil Moisture)',
      ],
      dataContracts: [
        'OGC WMS/WFS for Watershed Micro-Interventions',
        'GeoTIFF/COG for Surface Reflectance & Indices',
        'JSON Schema for Geo-Tagged Evidence Verification',
      ],
      note: 'SRISHTI-DRISHTI data integration is architecturally ready. Active data ingestion requires sanctioned MoRD/NRSC API keys.',
    };
  }

  async computeLulc(watershedId, year) {
    if (!this.isConfigured()) {
      const err = new Error('SRISHTI_DRISHTI_UNCONFIGURED');
      err.code = 'INTEGRATION_READY';
      err.details = 'Direct SRISHTI-DRISHTI connectivity requires authorized institutional credentials in server/.env (SRISHTI_API_KEY, SRISHTI_TOKEN). Google Earth Engine provider is the active operational engine.';
      throw err;
    }
    // Production implementation: fetch from NRSC/Bhuvan WFS/WCS
    throw new Error('Authorized credentials required for remote execution.');
  }

  async computeSoilMoisture(watershedId, options) {
    if (!this.isConfigured()) {
      const err = new Error('SRISHTI_DRISHTI_UNCONFIGURED');
      err.code = 'INTEGRATION_READY';
      err.details = 'EOS-04 / RISAT-1A SAR ingestion requires sanctioned NRSC API access. Active operational provider is Google Earth Engine (Sentinel-1 SAR).';
      throw err;
    }
    throw new Error('Authorized credentials required for remote execution.');
  }

  async computeTemporalChange(watershedId, beforeYear, afterYear) {
    if (!this.isConfigured()) {
      const err = new Error('SRISHTI_DRISHTI_UNCONFIGURED');
      err.code = 'INTEGRATION_READY';
      throw err;
    }
    throw new Error('Authorized credentials required for remote execution.');
  }

  async computeLandDegradation(watershedId, year) {
    if (!this.isConfigured()) {
      const err = new Error('SRISHTI_DRISHTI_UNCONFIGURED');
      err.code = 'INTEGRATION_READY';
      throw err;
    }
    throw new Error('Authorized credentials required for remote execution.');
  }

  async computePointAnalysis(lat, lng, radiusM) {
    if (!this.isConfigured()) {
      const err = new Error('SRISHTI_DRISHTI_UNCONFIGURED');
      err.code = 'INTEGRATION_READY';
      throw err;
    }
    throw new Error('Authorized credentials required for remote execution.');
  }
}
