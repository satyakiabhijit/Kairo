// content/extractors/index.js — Extractor router (hostname → extractor)

import claudeExtractor from './claude.js';
import chatgptExtractor from './chatgpt.js';
import geminiExtractor from './gemini.js';
import deepseekExtractor from './deepseek.js';
import { getPlatformByHost } from '../../shared/platforms.js';

const EXTRACTORS = {
  claude: claudeExtractor,
  chatgpt: chatgptExtractor,
  gemini: geminiExtractor,
  deepseek: deepseekExtractor,
};

/**
 * Returns the correct extractor for the given hostname.
 * @param {string} hostname - e.g. "claude.ai"
 * @returns {Object|null} The extractor object or null if unsupported
 */
export function getExtractor(hostname) {
  const platform = getPlatformByHost(hostname);
  return platform ? EXTRACTORS[platform.key] || null : null;
}
