// shared/inject.js — Single source of truth for the text injected into a chat input.

/**
 * Build the context text to inject from a capsule.
 *
 * Prefers the structured, enriched summary (with goals, stack, and key
 * decisions) and falls back to the raw captured snippet when no summary is
 * present. Used by both the popup and the in-page floating menu so that every
 * inject entry point produces an identical payload for a given capsule.
 *
 * @param {Object} capsule
 * @returns {string}
 */
export function buildInjectionText(capsule) {
  const content = (capsule && capsule.content) || {};

  if (content.summary) {
    const goals = (content.goals || []).join(', ');
    const stack = (content.stack || []).join(', ');
    const keyDecisions = (content.keyDecisions || []).join(', ');
    return `[Context from Kairo]\n\n${content.summary}\n\nGoals: ${goals}\n\nStack: ${stack}\n\nKey Decisions: ${keyDecisions}`;
  }

  return content.rawSnippet || '';
}
