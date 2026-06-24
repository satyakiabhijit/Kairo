// background/service-worker.js — Central hub for Kairo extension
// Handles: messaging, storage ops, enrichment, keyboard shortcuts, context menus

import { saveCapsule, getCapsules, deleteCapsule, updateCapsule, getSettings, saveSettings, clearAllCapsules } from '../shared/storage.js';
import { validateCapsule } from '../shared/capsule.js';
import { enrichCapsule } from './enricher.js';

// ─── Message Listener ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[msg.type];
  if (handler) {
    handler(msg, sender)
      .then(result => {
        sendResponse(result);
      })
      .catch(err => {
        console.error(`[Kairo SW] Error handling ${msg.type}:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep channel open for async response
  }
  return false;
});

const MESSAGE_HANDLERS = {
  async SAVE_CAPSULE(msg) {
    return handleSave(msg.capsule, msg.options);
  },

  async GET_CAPSULES() {
    return getCapsules();
  },

  async DELETE_CAPSULE(msg) {
    return deleteCapsule(msg.id);
  },

  async UPDATE_CAPSULE(msg) {
    return updateCapsule(msg.id, msg.updates);
  },

  async ENRICH_CAPSULE(msg) {
    const capsules = await getCapsules();
    const capsule = capsules.find(c => c.id === msg.id);
    if (!capsule) return { success: false, error: 'Capsule not found' };

    const enriched = await enrichCapsule(capsule);
    await saveCapsule(enriched);
    return { success: true, capsule: enriched };
  },

  async GET_SETTINGS() {
    return getSettings();
  },

  async SAVE_SETTINGS(msg) {
    return saveSettings(msg.settings);
  },

  async CLEAR_ALL() {
    return clearAllCapsules();
  },

  async INJECT_CONTEXT(msg) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return { success: false, error: 'No active tab' };

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (contextText) => {
          const selectors = [
            'div[contenteditable="true"]',
            '#prompt-textarea',
            'textarea[data-id="root"]',
            'rich-textarea',
            'textarea',
          ];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              el.focus();
              document.execCommand('insertText', false, contextText);
              return true;
            }
          }
          return false;
        },
        args: [msg.contextText],
      });

      return { success: true };
    } catch (err) {
      console.error('[Kairo SW] Inject error:', err);
      return { success: false, error: err.message };
    }
  },
};

// ─── Save Handler with Optional Enrichment ────────────────────────
async function handleSave(capsule, options = {}) {
  try {
    // Validate before saving
    const validation = validateCapsule(capsule);
    if (!validation.valid) {
      console.error('[Kairo SW] Invalid capsule:', validation.errors);
      return { success: false, errors: validation.errors };
    }

    // Auto-enrich if requested (non-blocking — don't fail save if enrichment fails)
    if (options.enrich) {
      try {
        capsule = await enrichCapsule(capsule);
      } catch (enrichErr) {
        console.warn('[Kairo SW] Enrichment failed, saving raw capsule:', enrichErr);
      }
    }

    const saveResult = await saveCapsule(capsule);
    if (!saveResult?.success) {
      return { success: false, error: saveResult?.error || 'Storage write failed' };
    }

    // Show notification — fire-and-forget, must NOT block success response
    try {
      chrome.notifications.create(`kairo-saved-${capsule.id.slice(0, 8)}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon48.png'),
        title: 'Kairo — Context Saved!',
        message: capsule.title || 'Capsule captured successfully.',
      });
    } catch (notifErr) {
      // Notification failure should never prevent a successful save
      console.warn('[Kairo SW] Notification failed (non-critical):', notifErr);
    }

    return { success: true, capsule };
  } catch (err) {
    console.error('[Kairo SW] Save error:', err);
    return { success: false, error: err.message };
  }
}

// ─── Keyboard Shortcut: Ctrl+Shift+S ──────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-kairo') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__kairoTriggerCapture?.(),
      }).catch(err => {
        console.error('[Kairo SW] Shortcut trigger error:', err);
      });
    });
  }
});

// ─── Context Menu ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'kairo-capture',
    title: 'Capture with Kairo',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://gemini.google.com/*',
      'https://chat.deepseek.com/*',
    ],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'kairo-capture' && tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__kairoTriggerCapture?.(),
    }).catch(err => {
      console.error('[Kairo SW] Context menu trigger error:', err);
    });
  }
});

console.log('[Kairo SW] Service worker initialized');
