export interface KnowledgeEntry {
  /** Simple OR-substring keywords — matches if ANY appears in the input. */
  keywords?: string[];
  /** AND-across-groups, OR-within-group — every group must have at least
   * one matching substring, in any order. Use this for intents that
   * combine two concepts (a structure type + "cost") where users phrase
   * the words in either order ("check dam cost" vs "cost of a check dam"
   * vs "how much this dam will cost"). Still fully deterministic
   * substring matching — no fuzzy/semantic logic. */
  requiredGroups?: string[][];
  answer: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Rule-based domain knowledge base — deliberately NOT an LLM-backed chatbot.
// Every answer here is fixed, reviewed, and accurate about this specific app.
// If a question doesn't match anything below, the chatbot says so honestly
// and refuses rather than guessing — see chatbotMatcher.ts. This is what
// makes it genuinely "restricted to the domain": there is no way for it to
// answer something outside this list, because nothing else exists for it
// to answer with.
// ═══════════════════════════════════════════════════════════════════════════

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  {
    keywords: ['what is jaldrishti', 'about jaldrishti', 'what does jaldrishti do', 'what is this app', 'what is this project'],
    answer: "JalDrishti is a watershed monitoring and decision-support platform built for SIH26015. It connects geo-tagged field photos, GIS layers, and satellite data so officers can verify evidence, get intervention recommendations, and simulate impact before building — not just document watershed activity after the fact.",
  },
  {
    keywords: ['trust score', 'geo-evidence', 'evidence trust', 'how is evidence verified'],
    answer: "The Geo-Evidence Trust Score checks 4 things about an uploaded field photo: GPS location accuracy, timestamp consistency, image metadata, and duplicate detection. It scores from 1-5 with a checklist showing exactly which checks passed or failed — it's not a black box.",
  },
  {
    keywords: ['recommendation engine', 'how does recommendation work', 'suitability score', 'which intervention'],
    answer: "The Recommendation Engine scores all 5 intervention types (Check Dam, Farm Pond, Percolation Tank, Contour Bunding, Farm Bund) at any clicked location, using real drainage/water proximity, land-use, and slope data, each weighted differently per type. We ran an internal prototype validation against the project's 17 reference intervention records — it gets the recorded type in its top-3 recommendations 62% of the time. This is internal validation against our own reference dataset, not an independently-verified real-world accuracy study.",
  },
  {
    keywords: ['impact simulation', 'what if simulator', 'water retention', 'recharge zone'],
    answer: "Impact Simulation estimates water retention, recharge zone area, and flood-risk reduction for a hypothetical intervention at any location, using the Rational Method — a real, standard hydrology formula — combined with real slope and land-use data. It refuses to show results for locations too far from our modeled watersheds, rather than faking numbers.",
  },
  {
    keywords: ['groundwater', 'water table'],
    answer: "Groundwater impact is shown as a category — Low, Moderate, or High — not a precise number in metres. A specific water-table rise prediction needs real aquifer specific-yield data, which this prototype doesn't have, so we don't claim a precision we can't back up.",
  },
  {
    keywords: ['structural health', 'inspection score', 'structure condition'],
    answer: "The Structural Health Score assesses a structure's physical condition — based on time since last inspection, structure age vs. expected service life, and keyword-scanning inspection notes for damage terms. It's distinct from the Trust Score, which assesses evidence reliability, not structural condition.",
  },
  {
    keywords: ['alert', 'maintenance alert', 'inspection overdue', '180 day'],
    answer: "Maintenance alerts are computed live — comparing today's date against each structure's last inspection date and its type-specific inspection interval. The 180-day interval is grounded in the Central Water Commission's real dam-safety guideline of twice-yearly (pre-monsoon, post-monsoon) inspection.",
  },
  {
    keywords: ['check dam'],
    answer: "A check dam is a small barrier built across a drainage channel to slow water flow, allow sediment to settle, and encourage water to pool and infiltrate the ground — typically used where drainage proximity and moderate-to-steep slope make it effective.",
  },
  {
    keywords: ['farm pond'],
    answer: "A farm pond is an excavated basin that collects and stores rainwater runoff, mainly for irrigation. It works best on flatter agricultural land where water can pool without needing a channel crossing.",
  },
  {
    keywords: ['percolation tank'],
    answer: "A percolation tank is similar to a farm pond but designed specifically to encourage groundwater recharge through infiltration, rather than surface storage for direct irrigation use.",
  },
  {
    keywords: ['contour bunding', 'contour trenching'],
    answer: "Contour bunding involves building small ridges along the natural contour lines of a slope, to slow surface runoff and reduce soil erosion — it's specifically suited to steeper terrain.",
  },
  {
    keywords: ['farm bund'],
    answer: "A farm bund is a low earthen ridge built along field boundaries to retain moisture and prevent soil loss. It doesn't need to be near water — it's the most broadly-applicable structure for flatter agricultural land.",
  },
  {
    keywords: ['watershed', 'watershed development'],
    answer: "A watershed is an area of land where all surface water drains to a common point. Watershed development means managing land, water, and vegetation within that boundary — through structures like check dams and farm ponds — to conserve water and reduce degradation, particularly in semi-arid rural regions.",
  },
  {
    keywords: ['real data', 'mock data', 'fake data', 'is this real', 'live data'],
    answer: "Some parts are genuinely real and live: our slope layer (real SRTM satellite elevation data), the live Earth Engine computation on the Analysis page, and our authentication system. Project records, alerts, and watershed boundaries are a structured prototype dataset, clearly labeled as such wherever they appear.",
  },
  {
    keywords: ['srishti', 'drishti', 'bhuvan', 'bhoonidhi'],
    answer: "SRISHTI-DRISHTI is the official satellite data platform named in our problem statement, but it's a closed system restricted to registered government agencies with no public API. We built our pipeline against Google Earth Engine instead, using the same underlying 30m-resolution Landsat data, and designed our architecture to swap in SRISHTI-DRISHTI directly once we have registered access.",
  },
  {
    keywords: ['ndvi', 'ndwi'],
    answer: "NDVI (Normalized Difference Vegetation Index) measures vegetation health from satellite imagery. NDWI (Normalized Difference Water Index) measures surface water/wetness. We compute both live from real Landsat 8/9 imagery to classify land cover into Forest, Agricultural, Water, and Barren categories.",
  },
  {
    keywords: ['soil moisture'],
    answer: "We don't measure true soil moisture — that requires radar/SAR satellite data (like Sentinel-1), which this prototype doesn't integrate. What we show instead is a real NDWI-based wetness proxy, computed from live Landsat imagery, clearly labeled as a proxy and not true soil moisture.",
  },
  {
    keywords: ['login', 'officer account', 'district access'],
    answer: "Officers log in with district-scoped accounts — each District Watershed Officer sees only their own district's data, while a State Nodal Admin sees all districts. When our backend is running, this uses real authentication (bcrypt password hashing, signed JWT tokens); otherwise it falls back to a clearly-labeled demo mode.",
  },
  {
    keywords: ['hello', 'hi', 'hey'],
    answer: "Hi! I'm the JalDrishti assistant — ask me about watershed development, our Recommendation Engine, Trust Score, Impact Simulation, or any other feature of this app.",
  },
  {
    keywords: ['thank', 'thanks'],
    answer: "You're welcome! Let me know if you have more questions about JalDrishti or watershed development.",
  },
  {
    requiredGroups: [
      ['check dam', ' dam', 'dam '],
      ['cost', 'price', 'how much', 'expensive', 'budget', 'rupee', '₹', 'lakh'],
    ],
    answer: "Check Dam construction cost is estimated at ₹20–30 per cubic metre of seasonal water retention, per MGNREGA's published \"Guidelines for New/Additional Works\" reference rate for storage structures. This is an older published figure, not inflation-adjusted, so real 2026 costs are likely higher — treat it as a rough order-of-magnitude reference, not a quotation. For an exact range based on your clicked location and structure size, run it in Impact Simulation — it computes this live from the real water-retention volume.",
  },
  {
    requiredGroups: [
      ['farm pond', 'pond'],
      ['cost', 'price', 'how much', 'expensive', 'budget', 'rupee', '₹', 'lakh'],
    ],
    answer: "Farm Pond cost uses the same MGNREGA-published reference rate as other storage structures — ₹20–30 per cubic metre of water retention, from an older guideline document, not inflation-adjusted. For a size-specific range, use Impact Simulation, which computes this live from the actual water volume at your clicked location.",
  },
  {
    requiredGroups: [
      ['percolation tank', 'percolation'],
      ['cost', 'price', 'how much', 'expensive', 'budget', 'rupee', '₹', 'lakh'],
    ],
    answer: "Percolation Tank cost uses the same MGNREGA-published reference — ₹20–30 per cubic metre of water stored, from an older guideline, not inflation-adjusted for current rates. Impact Simulation computes a specific range live for your selected location and tank size.",
  },
  {
    requiredGroups: [
      ['farm bund', 'contour bunding', 'bund', 'bunding', 'contour trenching'],
      ['cost', 'price', 'how much', 'expensive', 'budget', 'rupee', '₹', 'lakh'],
    ],
    answer: "Cost estimation isn't available for Farm Bund or Contour Bunding in this prototype — the only cited reference rate we have (MGNREGA's ₹/cubic-metre-of-water-stored figure) applies to storage structures like Check Dams, Farm Ponds, and Percolation Tanks, not to bund-type interventions, which don't have a comparable volume-based cost basis in the source we used. We didn't want to force-fit an inapplicable number just to show something.",
  },
  {
    keywords: ['how much will it cost', 'how much does it cost', 'construction cost', 'how much will this cost', 'cost estimate', 'what does this cost'],
    answer: "Construction cost estimates are available for storage-type structures (Check Dam, Farm Pond, Percolation Tank) in Impact Simulation, computed live from the real water-retention volume at your clicked location using a published MGNREGA reference rate (₹20–30/cubic metre stored). That figure is from an older guideline and isn't inflation-adjusted, so treat it as order-of-magnitude, not a quotation. Bund-type interventions don't have a comparable cost reference in this prototype.",
  },
];

export const REFUSAL_MESSAGE =
  "I can only answer questions about JalDrishti and watershed development — things like the Recommendation Engine, Trust Score, Impact Simulation, or intervention types. That's outside what I can help with here.";
