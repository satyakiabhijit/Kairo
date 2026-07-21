// content/extractors/gemini.js — Gemini DOM extractor
// Selectors verified: May 2026

import { getSafeText } from '../../shared/utils.js';

export default {
  platform: 'gemini',

  extract() {
    let userTurns, aiTurns;

    // Strategy 1: specific Gemini query/response classes
    userTurns = [...document.querySelectorAll('.user-query-text')];
    aiTurns = [...document.querySelectorAll('.model-response-text')];

    if (userTurns.length || aiTurns.length) {
      const turns = [];
      const max = Math.max(userTurns.length, aiTurns.length);
      for (let i = 0; i < max; i++) {
        if (userTurns[i]) turns.push({ role: 'user', text: getSafeText(userTurns[i]) });
        if (aiTurns[i]) turns.push({ role: 'assistant', text: getSafeText(aiTurns[i]) });
      }
      console.log(`[Kairo Extractor] Gemini: ${turns.length} turns (primary selector)`);
      return turns.filter((t) => t.text.length > 0);
    }

    // Strategy 2: data-query-id / data-response-id
    userTurns = [...document.querySelectorAll('[data-query-id]')];
    aiTurns = [...document.querySelectorAll('[data-response-id], .response-container')];
    if (userTurns.length || aiTurns.length) {
      const turns = [];
      const max = Math.max(userTurns.length, aiTurns.length);
      for (let i = 0; i < max; i++) {
        if (userTurns[i]) turns.push({ role: 'user', text: getSafeText(userTurns[i]) });
        if (aiTurns[i]) turns.push({ role: 'assistant', text: getSafeText(aiTurns[i]) });
      }
      console.log(`[Kairo Extractor] Gemini: ${turns.length} turns (data-id selector)`);
      return turns.filter((t) => t.text.length > 0);
    }

    // Strategy 3: conversation turn containers
    let turns = [
      ...document.querySelectorAll('[class*="query-content"], [class*="response-content"]'),
    ];
    if (turns.length) {
      console.log(`[Kairo Extractor] Gemini: ${turns.length} turns (content class)`);
      return turns
        .map((el) => {
          const isUser = el.className.toLowerCase().includes('query');
          return { role: isUser ? 'user' : 'assistant', text: getSafeText(el) };
        })
        .filter((t) => t.text.length > 0);
    }

    // Strategy 4: message containers by class pattern
    const mainArea =
      document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    turns = [
      ...mainArea.querySelectorAll(
        '[class*="message"], [class*="Message"], [class*="turn"], [class*="Turn"], [class*="chat"]',
      ),
    ];
    if (turns.length >= 2) {
      console.log(`[Kairo Extractor] Gemini: ${turns.length} turns (class pattern)`);
      return turns
        .map((el, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: getSafeText(el),
        }))
        .filter((t) => t.text.length > 0);
    }

    // Final fallback
    console.warn('[Kairo Extractor] Gemini: using full-page text fallback');
    const bodyText = getSafeText(document.body);
    if (bodyText.length > 50) {
      return [{ role: 'user', text: bodyText.slice(0, 8000) }];
    }

    return [];
  },
};
