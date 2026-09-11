/**
 * SatelliteDataProvider Base Interface
 * 
 * Abstract class defining the contract for all satellite data sources
 * in JalDrishti (Google Earth Engine, Srishti-Drishti, etc.).
 * 
 * Decouples the analytical engine from provider-specific data formats
 * and enforces common normalized responses.
 */

export class SatelliteDataProvider {
  constructor(name, providerType) {
    this.name = name;
    this.providerType = providerType; // 'active' | 'adapter' | 'mock'
  }

  /**
   * Returns provider operational status and configuration.
   */
  async getStatus() {
    throw new Error('getStatus() not implemented');
  }

  /**
   * Computes LULC classification for a watershed and year.
   * @param {string} watershedId
   * @param {number|string} year
   * @returns {Promise<Object>} Normalized LULC and optical indices
   */
  async computeLulc(watershedId, year) {
    throw new Error('computeLulc() not implemented');
  }

  /**
   * Computes genuine Sentinel-1 SAR Surface Soil Moisture Index (SSMI)
   * for a watershed comparing two date ranges.
   * @param {string} watershedId
   * @param {Object} options - { beforeStart, beforeEnd, afterStart, afterEnd }
   * @returns {Promise<Object>} Normalized Soil Moisture Index result
   */
  async computeSoilMoisture(watershedId, options) {
    throw new Error('computeSoilMoisture() not implemented');
  }

  /**
   * Computes multi-period temporal change detection (NDVI, NDWI, LULC shifts).
   * @param {string} watershedId
   * @param {number|string} beforeYear
   * @param {number|string} afterYear
   * @returns {Promise<Object>} Normalized change metrics
   */
  async computeTemporalChange(watershedId, beforeYear, afterYear) {
    throw new Error('computeTemporalChange() not implemented');
  }

  /**
   * Computes multi-criteria satellite-derived land degradation indicator.
   * @param {string} watershedId
   * @param {number|string} year
   * @returns {Promise<Object>} Degradation risk score and contributing factors
   */
  async computeLandDegradation(watershedId, year) {
    throw new Error('computeLandDegradation() not implemented');
  }

  /**
   * Computes satellite context for a specific geo-coded field point.
   * @param {number} lat
   * @param {number} lng
   * @param {number} radiusM
   * @returns {Promise<Object>} Point analysis result
   */
  async computePointAnalysis(lat, lng, radiusM) {
    throw new Error('computePointAnalysis() not implemented');
  }
}
