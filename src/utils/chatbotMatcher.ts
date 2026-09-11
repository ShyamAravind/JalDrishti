import { KNOWLEDGE_BASE, REFUSAL_MESSAGE } from '../data/chatbotKnowledgeBase';

/** Finds the best-matching knowledge base entry for a user's question.
 * Deliberately simple substring matching, not fuzzy/semantic — this is
 * exactly what makes the restriction real: the bot can only ever return
 * one of the fixed answers above, or the refusal message. There is no
 * generation step where it could go off-topic. */
export function matchChatbotResponse(userInput: string): string {
  const normalized = userInput.toLowerCase().trim();
  if (!normalized) return REFUSAL_MESSAGE;

  let bestMatch: { answer: string; score: number } | null = null;

  for (const entry of KNOWLEDGE_BASE) {
    // Simple OR-substring keywords (existing behavior).
    for (const keyword of entry.keywords ?? []) {
      if (normalized.includes(keyword)) {
        const score = keyword.length;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { answer: entry.answer, score };
        }
      }
    }

    // AND-across-groups, OR-within-group — every group needs at least one
    // hit, regardless of word order in the user's phrasing.
    if (entry.requiredGroups) {
      let allGroupsMatched = true;
      let totalScore = 0;
      for (const group of entry.requiredGroups) {
        const hit = group.find(kw => normalized.includes(kw));
        if (!hit) { allGroupsMatched = false; break; }
        totalScore += hit.trim().length;
      }
      if (allGroupsMatched) {
        // Multi-group matches are inherently more specific than a single
        // keyword hit, so give them a floor boost to rank above generic
        // single-keyword matches (e.g. a bare "farm pond" definition)
        // even when the raw substring lengths are similar.
        const score = totalScore + 10;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { answer: entry.answer, score };
        }
      }
    }
  }

  // Require a minimum match strength to avoid false positives on very
  // short, ambiguous substrings.
  if (bestMatch && bestMatch.score >= 4) {
    return bestMatch.answer;
  }
  return REFUSAL_MESSAGE;
}
