// shared/utils.js — Utility functions for date formatting, text truncation, etc.

/**
 * Format a Unix timestamp into a human-readable relative string.
 * @param {number} timestamp
 * @returns {string}
 */
export function timeAgo(timestamp, locale = 'en') {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  const isEs = locale === 'es';

  if (seconds < 60) return isEs ? 'hace un momento' : 'just now';
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return isEs ? `hace ${mins}m` : `${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return isEs ? `hace ${hours}h` : `${hours}h ago`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return isEs ? `hace ${days}d` : `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString(isEs ? 'es-ES' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Truncate text to a maximum length with ellipsis.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(text, maxLen = 120) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

/**
 * Get a platform display name from the source key.
 * @param {string} source
 * @returns {string}
 */
export function platformName(source) {
  const names = {
    claude: 'Claude',
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
  };
  return names[source] || source || 'Unknown';
}

/**
 * Recursively gather text nodes, skipping scripts, styles, and iframes to prevent security errors.
 * @param {Element} el
 * @returns {string}
 */
export function getSafeText(el) {
  if (!el) return '';
  let text = '';
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement;
      while (parent) {
        const tag = parent.tagName;
        if (tag === 'IFRAME' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walk.nextNode()) {
    text += walk.currentNode.textContent + ' ';
  }
  return text.trim();
}
