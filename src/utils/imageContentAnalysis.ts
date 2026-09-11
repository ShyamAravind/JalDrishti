// ═══════════════════════════════════════════════════════════════════════════
// Image Content Analysis — genuine pixel-based heuristics, NOT a trained ML
// model. This runs entirely client-side via the Canvas API: samples pixels
// from the uploaded image, classifies each by HSV color range (blue-ish =
// water, green-ish = vegetation, brown/tan = bare soil, gray = structure),
// and derives categorical observations from the resulting proportions.
//
// This is real, verifiable, and honest about its own limits — it is color-
// based heuristic classification, not semantic segmentation or a trained
// classifier. It will genuinely misclassify images with unusual lighting,
// shadows, or colors outside these simple bands. That limitation is
// disclosed in the UI, not hidden.
// ═══════════════════════════════════════════════════════════════════════════

export type VegetationClass = 'Dense' | 'Moderate' | 'Sparse' | 'Bare';
export type WaterPresence = 'Detected' | 'Not Detected' | 'Uncertain';
export type ErosionSignal = 'Possible' | 'Not Detected' | 'Uncertain';
export type LandCondition = 'Healthy' | 'Mixed' | 'Degraded' | 'Unknown';
export type InterventionGuess =
  | 'Check Dam' | 'Farm Pond' | 'Water Body' | 'Bare/Agricultural Land' | 'Other' | 'Unknown';

export interface ImageContentAnalysis {
  vegetation: VegetationClass;
  waterPresence: WaterPresence;
  erosion: ErosionSignal;
  landCondition: LandCondition;
  interventionGuess: InterventionGuess;
  pixelStats: {
    greenPct: number;
    bluePct: number;
    brownTanPct: number;
    grayStructurePct: number;
    edgeRoughness: number; // 0-100, rough texture-variance proxy
  };
  explanations: string[];
  method: 'Heuristic color/edge analysis (Canvas pixel sampling)'; // never claim ML
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return [h, s, v];
}

export async function analyzeImageContent(imageUrl: string): Promise<ImageContentAnalysis> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not load image for analysis'));
    img.src = imageUrl;
  });

  const SAMPLE_SIZE = 120; // downsample for speed — sampling, not full-res
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let greenCount = 0, blueCount = 0, brownTanCount = 0, grayCount = 0;
  let edgeSum = 0, edgeSamples = 0;
  const totalPixels = SAMPLE_SIZE * SAMPLE_SIZE;

  for (let py = 0; py < SAMPLE_SIZE; py++) {
    for (let px = 0; px < SAMPLE_SIZE; px++) {
      const i = (py * SAMPLE_SIZE + px) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [h, s, v] = rgbToHsv(r, g, b);

      if (h >= 70 && h <= 170 && s > 0.15 && v > 0.15) greenCount++;
      else if (h >= 175 && h <= 260 && s > 0.15 && v > 0.15) blueCount++;
      else if (h >= 15 && h <= 50 && s > 0.2 && v > 0.25) brownTanCount++;
      else if (s < 0.12 && v > 0.25 && v < 0.85) grayCount++;

      // Crude edge-roughness proxy: local gradient vs. right neighbor
      if (px < SAMPLE_SIZE - 1) {
        const j = (py * SAMPLE_SIZE + px + 1) * 4;
        const diff = Math.abs(r - data[j]) + Math.abs(g - data[j + 1]) + Math.abs(b - data[j + 2]);
        edgeSum += diff;
        edgeSamples++;
      }
    }
  }

  const greenPct = Math.round((greenCount / totalPixels) * 100);
  const bluePct = Math.round((blueCount / totalPixels) * 100);
  const brownTanPct = Math.round((brownTanCount / totalPixels) * 100);
  const grayStructurePct = Math.round((grayCount / totalPixels) * 100);
  const edgeRoughness = Math.min(100, Math.round((edgeSum / edgeSamples / 3) * 100 / 255));

  // ── Derive categorical observations from pixel proportions ──────────────
  const vegetation: VegetationClass =
    greenPct > 45 ? 'Dense' : greenPct > 22 ? 'Moderate' : greenPct > 8 ? 'Sparse' : 'Bare';

  const waterPresence: WaterPresence =
    bluePct > 8 ? 'Detected' : bluePct >= 3 ? 'Uncertain' : 'Not Detected';

  // Erosion is the hardest signal to infer from color alone — kept
  // deliberately conservative, defaulting to Uncertain rather than a
  // confident guess, since bare soil color alone does not prove erosion.
  const erosion: ErosionSignal =
    brownTanPct > 35 && edgeRoughness > 40 ? 'Possible' :
    brownTanPct < 10 ? 'Not Detected' : 'Uncertain';

  const landCondition: LandCondition =
    greenPct > 40 && brownTanPct < 20 ? 'Healthy' :
    brownTanPct > 45 && greenPct < 15 ? 'Degraded' :
    (greenPct > 5 || brownTanPct > 5) ? 'Mixed' : 'Unknown';

  // Intervention-type guess — the coarsest, least reliable inference here,
  // explicitly labeled as a guess, not a classification result.
  let interventionGuess: InterventionGuess = 'Unknown';
  if (bluePct > 8 && grayStructurePct > 12) interventionGuess = 'Check Dam';
  else if (bluePct > 15 && grayStructurePct <= 12) interventionGuess = 'Water Body';
  else if (bluePct > 4 && bluePct <= 15 && grayStructurePct <= 8) interventionGuess = 'Farm Pond';
  else if (brownTanPct > 30 || greenPct > 25) interventionGuess = 'Bare/Agricultural Land';
  else interventionGuess = 'Other';

  const explanations: string[] = [];
  explanations.push(
    vegetation === 'Dense' ? `Vegetation appears dense — ${greenPct}% of sampled pixels are green-toned.` :
    vegetation === 'Bare' ? `Little vegetation detected — only ${greenPct}% of sampled pixels are green-toned.` :
    `Vegetation appears ${vegetation.toLowerCase()} based on ${greenPct}% green-toned pixel coverage.`
  );
  if (waterPresence === 'Detected') {
    explanations.push(`Water presence detected — ${bluePct}% of sampled pixels fall in the blue/cyan range.`);
  } else if (waterPresence === 'Uncertain') {
    explanations.push(`Possible water presence — only ${bluePct}% blue-toned pixels, below a confident threshold.`);
  }
  if (grayStructurePct > 10) {
    explanations.push(`${grayStructurePct}% gray/low-saturation pixels detected — may indicate a built structure (concrete, masonry) or bare rock.`);
  }
  if (erosion === 'Possible') {
    explanations.push(`Exposed soil-toned regions (${brownTanPct}%) combined with high visual texture variance suggest possible erosion — not confirmed.`);
  }

  return {
    vegetation, waterPresence, erosion, landCondition, interventionGuess,
    pixelStats: { greenPct, bluePct, brownTanPct, grayStructurePct, edgeRoughness },
    explanations,
    method: 'Heuristic color/edge analysis (Canvas pixel sampling)',
  };
}
