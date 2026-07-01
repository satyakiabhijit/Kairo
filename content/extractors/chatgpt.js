// content/extractors/chatgpt.js — ChatGPT DOM extractor
// Serves chatgpt.com (the legacy OpenAI chat host permanently redirects here)
// Selectors verified: May 2026

export default {
  platform: 'chatgpt',

  extract() {
    let turns;

    // ── Scope to the active conversation thread only ──────────────────────
    // ChatGPT renders a sidebar with conversation history that also contains
    // [data-message-author-role] elements — we must exclude that.
    const threadSelectors = [
      '[class*="ConversationPanel"]',
      '[class*="conversation-panel"]',
      'main [class*="Thread"]',
      'main [class*="thread"]',
      '#__next main',
      'main',
    ];

    let threadEl = null;
    for (const sel of threadSelectors) {
      const el = document.querySelector(sel);
      if (el) { threadEl = el; break; }
    }

    const root = threadEl || document.body;

    // Strategy 1: data-message-author-role — scoped to thread
    turns = [...root.querySelectorAll('[data-message-author-role]')];
    if (turns.length) {
      // Filter out anything that might be from nav/sidebar (no meaningful text)
      const filtered = turns.filter(el => el.innerText.trim().length > 0);
      console.log(`[Kairo Extractor] ChatGPT: ${filtered.length} turns (data-message-author-role, thread-scoped)`);
      return filtered.map(el => ({
        role: el.dataset.messageAuthorRole === 'user' ? 'user' : 'assistant',
        text: el.innerText.trim(),
      }));
    }

    // Strategy 2: article[data-testid="conversation-turn-*"]
    turns = [...root.querySelectorAll('article[data-testid^="conversation-turn"]')];
    if (turns.length) {
      console.log(`[Kairo Extractor] ChatGPT: ${turns.length} turns (article[data-testid])`);
      return turns.map(el => ({
        role: el.querySelector('[data-message-author-role="user"]') !== null ? 'user' : 'assistant',
        text: el.innerText.trim(),
      })).filter(t => t.text.length > 0);
    }

    // Strategy 3: .group containers inside main (older ChatGPT UI)
    turns = [...document.querySelectorAll('main .group')];
    if (turns.length >= 2) {
      console.log(`[Kairo Extractor] ChatGPT: ${turns.length} turns (.group in main)`);
      return turns.map((el, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: el.innerText.trim(),
        _lowConfidenceRole: true,
      })).filter(t => t.text.length > 0);
    }

    // Strategy 4: div[class*="message"] inside main
    turns = [...document.querySelectorAll('main div[class*="message"], main div[class*="Message"]')];
    if (turns.length >= 2) {
      // Deduplicate nested matches (keep outermost)
      const deduped = turns.filter(el => !turns.some(other => other !== el && other.contains(el)));
      if (deduped.length >= 2) {
        console.log(`[Kairo Extractor] ChatGPT: ${deduped.length} turns (div[class*=message] deduped)`);
        return deduped.map((el, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: el.innerText.trim(),
          _lowConfidenceRole: true,
        })).filter(t => t.text.length > 0);
      }
    }

    // Strategy 5: any substantial block inside main
    const mainEl = document.querySelector('main') || document.querySelector('[role="main"]');
    if (mainEl) {
      const allBlocks = [...mainEl.querySelectorAll(':scope > * > * > *')];
      const textBlocks = allBlocks.filter(el => el.innerText.trim().length > 30);
      if (textBlocks.length >= 2) {
        console.log(`[Kairo Extractor] ChatGPT: ${textBlocks.length} blocks (main children)`);
        return textBlocks.map((el, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: el.innerText.trim(),
          _lowConfidenceRole: true,
        }));
      }
    }

    // Final fallback — full page visible text
    console.warn('[Kairo Extractor] ChatGPT: using full-page text fallback');
    const bodyText = document.body.innerText.trim();
    if (bodyText.length > 50) {
      return [{ role: 'user', text: bodyText.slice(0, 8000) }];
    }

    return [];
  },
};
