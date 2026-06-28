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

      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        // Self-contained mirror of insertTextIntoEditor() in shared/inject.js.
        // chrome.scripting.executeScript serializes this function and runs it in
        // the page, so it cannot import modules — keep this algorithm in sync
        // with the shared helper. Inserts only; never submits.
        func: (contextText) => {
          if (!contextText) return false;

          const selectors = [
            'div[contenteditable="true"]',
            '#prompt-textarea',
            'textarea[data-id="root"]',
            'rich-textarea',
            'textarea',
          ];
          let el = null;
          for (const sel of selectors) {
            el = document.querySelector(sel);
            if (el) break;
          }
          if (!el) return false;

          el.focus();

          const tag = el.tagName;

          // Native <textarea> / <input>: prototype value setter + InputEvent.
          if (tag === 'TEXTAREA' || tag === 'INPUT') {
            const proto =
              tag === 'TEXTAREA'
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, 'value');
            const next = el.value ? `${el.value}\n\n${contextText}` : contextText;
            if (desc && desc.set) desc.set.call(el, next);
            else el.value = next;
            el.dispatchEvent(
              new InputEvent('input', { bubbles: true, inputType: 'insertText', data: contextText })
            );
            return true;
          }

          // Rich contenteditable (Claude ProseMirror, Gemini, ChatGPT).
          const editable = el.isContentEditable
            ? el
            : el.querySelector('[contenteditable="true"], .ProseMirror') || el;
          if (editable.focus) editable.focus();

          const moveCaretToEnd = (node) => {
            const sel = window.getSelection && window.getSelection();
            if (!sel) return;
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          };
          const insertAtCaret = (node, text) => {
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const parts = String(text).split('\n');
              const frag = document.createDocumentFragment();
              parts.forEach((part, i) => {
                if (i > 0) frag.appendChild(document.createElement('br'));
                frag.appendChild(document.createTextNode(part));
              });
              range.insertNode(frag);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              node.textContent = (node.textContent || '') + text;
            }
          };

          moveCaretToEnd(editable);
          const start = editable.textContent;
          const changed = () => editable.textContent !== start;

          const handledByEditor = !editable.dispatchEvent(
            new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: contextText,
            })
          );
          if (handledByEditor || changed()) return true;

          try {
            const dt = new DataTransfer();
            dt.setData('text/plain', contextText);
            editable.dispatchEvent(
              new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt })
            );
          } catch (_) {
            /* ClipboardEvent not constructable in this engine */
          }
          if (changed()) return true;

          insertAtCaret(editable, contextText);
          editable.dispatchEvent(
            new InputEvent('input', { bubbles: true, inputType: 'insertText', data: contextText })
          );
          if (changed()) return true;

          try {
            document.execCommand('insertText', false, contextText);
          } catch (_) {
            /* deprecated legacy fallback */
          }
          return true;
        },
        args: [msg.contextText],
      });

      if (injection && injection.result === false) {
        return { success: false, error: 'No chat input found on the page' };
      }
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
