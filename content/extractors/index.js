// content/extractors/index.js — Extractor router (hostname → extractor)

import claudeExtractor from './claude.js';
import chatgptExtractor from './chatgpt.js';
import geminiExtractor from './gemini.js';
import deepseekExtractor from './deepseek.js';

const EXTRACTORS = {
  'claude.ai': claudeExtractor,
  'chatgpt.com': chatgptExtractor,
  'gemini.google.com': geminiExtractor,
  'chat.deepseek.com': deepseekExtractor,
};

/**
 * Returns the correct extractor for the given hostname.
 * @param {string} hostname - e.g. "claude.ai"
 * @returns {Object|null} The extractor object or null if unsupported
 */
export function getExtractor(hostname) {
  return EXTRACTORS[hostname] || null;
}
