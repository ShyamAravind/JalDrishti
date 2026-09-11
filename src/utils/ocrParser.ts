// Parses OCR-extracted text for latitude/longitude patterns. Supports
// decimal degrees and common DMS formats. Validates that results are
// geographically plausible before returning them — never returns a guess.

export interface OcrParseResult {
  lat: number | null;
  lng: number | null;
  alt: string | null;
  date: string | null;
  time: string | null;
}

function isPlausibleLat(v: number): boolean { return v >= -90 && v <= 90; }
function isPlausibleLng(v: number): boolean { return v >= -180 && v <= 180; }

export function parseOcrText(text: string): OcrParseResult {
  const result: OcrParseResult = { lat: null, lng: null, alt: null, date: null, time: null };

  // Decimal degree patterns: "Latitude: 23.7200", "Lat 23.72 N", "23.7200, 73.6800"
  const decimalPairMatch = text.match(/(-?\d{1,3}\.\d{3,8})\s*[,\s]\s*(-?\d{1,3}\.\d{3,8})/);
  const latLabelMatch = text.match(/lat(?:itude)?[:\s]+(-?\d{1,3}\.\d{3,8})/i);
  const lngLabelMatch = text.match(/lon(?:g|gitude)?[:\s]+(-?\d{1,3}\.\d{3,8})/i);

  if (latLabelMatch && lngLabelMatch) {
    const lat = parseFloat(latLabelMatch[1]);
    const lng = parseFloat(lngLabelMatch[1]);
    if (isPlausibleLat(lat) && isPlausibleLng(lng)) { result.lat = lat; result.lng = lng; }
  } else if (decimalPairMatch) {
    const a = parseFloat(decimalPairMatch[1]);
    const b = parseFloat(decimalPairMatch[2]);
    // Assume lat,lng order (most common convention); validate both ranges.
    if (isPlausibleLat(a) && isPlausibleLng(b)) { result.lat = a; result.lng = b; }
  }

  // DMS pattern: 23°43'12"N 73°40'48"E
  if (result.lat === null) {
    const dmsMatch = text.match(
      /(\d{1,3})[°\s](\d{1,2})['\s](\d{1,2}(?:\.\d+)?)["\s]*([NS])[,\s]+(\d{1,3})[°\s](\d{1,2})['\s](\d{1,2}(?:\.\d+)?)["\s]*([EW])/i
    );
    if (dmsMatch) {
      const toDecimal = (d: string, m: string, s: string, dir: string) => {
        const val = parseFloat(d) + parseFloat(m) / 60 + parseFloat(s) / 3600;
        return (dir.toUpperCase() === 'S' || dir.toUpperCase() === 'W') ? -val : val;
      };
      const lat = toDecimal(dmsMatch[1], dmsMatch[2], dmsMatch[3], dmsMatch[4]);
      const lng = toDecimal(dmsMatch[5], dmsMatch[6], dmsMatch[7], dmsMatch[8]);
      if (isPlausibleLat(lat) && isPlausibleLng(lng)) { result.lat = lat; result.lng = lng; }
    }
  }

  const altMatch = text.match(/alt(?:itude)?[:\s]+(\d+(?:\.\d+)?)\s*m/i);
  if (altMatch) result.alt = altMatch[1];

  const dateMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
  if (dateMatch) result.date = dateMatch[1];

  const timeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (timeMatch) result.time = timeMatch[1];

  return result;
}
