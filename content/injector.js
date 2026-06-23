// content/injector.js — Injects the Kairo button next to chat inputs and handles the capture/inject menu

import { buildInjectionText } from '../shared/inject.js';

let buttonWrapper = null;
let currentTextarea = null;

export function injectButton(onCapture) {
  if (document.getElementById('kairo-container')) return;

  // Create a container for the button and menu
  const container = document.createElement('div');
  container.id = 'kairo-container';
  container.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    display: none;
    align-items: center;
    gap: 8px;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  // Capsule Logo Button
  const btn = document.createElement('button');
  btn.id = 'kairo-logo-btn';
  btn.setAttribute('aria-label', 'Kairo Options');
  const imgUrl = chrome.runtime.getURL('assets/capsule-logo.png');

  btn.style.cssText = `
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: url('${imgUrl}') center/cover no-repeat, linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
    box-shadow: 0 4px 12px rgba(108, 71, 255, 0.4);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.boxShadow = '0 6px 16px rgba(108, 71, 255, 0.5)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(108, 71, 255, 0.4)';
  });

  // Menu Dropdown
  const menu = document.createElement('div');
  menu.style.cssText = `
    position: absolute;
    bottom: 40px;
    right: 0;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 6px;
    display: none;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    min-width: 140px;
  `;

  // Capture Option
  const captureOpt = document.createElement('button');
  captureOpt.textContent = 'Capture';
  styleMenuOption(captureOpt);

  // Inject Option
  const injectOpt = document.createElement('button');
  injectOpt.textContent = 'Inject';
  styleMenuOption(injectOpt);

  // Inject Modal (to pick capsule)
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: absolute;
    bottom: 80px;
    right: 0;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 12px;
    display: none;
    flex-direction: column;
    gap: 8px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.6);
    width: 250px;
    max-height: 300px;
    overflow-y: auto;
  `;

  menu.appendChild(captureOpt);
  menu.appendChild(injectOpt);

  container.appendChild(menu);
  container.appendChild(modal);
  container.appendChild(btn);
  document.body.appendChild(container);

  buttonWrapper = container;

  // Toggle menu
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.style.display === 'flex') {
      menu.style.display = 'none';
      modal.style.display = 'none';
    } else {
      menu.style.display = 'flex';
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      menu.style.display = 'none';
      modal.style.display = 'none';
    }
  });

  // Action: Capture
  captureOpt.addEventListener('click', async () => {
    captureOpt.textContent = 'Capturing...';
    try {
      const success = await onCapture();
      if (success === false) {
        captureOpt.textContent = 'Capture';
        return;
      }
      captureOpt.textContent = 'Saved';
    } catch (err) {
      captureOpt.textContent = 'Failed';
      console.error('[Kairo] Capture error:', err);
    }
    setTimeout(() => {
      captureOpt.textContent = 'Capture';
      menu.style.display = 'none';
    }, 2000);
  });

  // Action: Inject
  injectOpt.addEventListener('click', async () => {
    menu.style.display = 'none';
    modal.style.display = 'flex';
    modal.innerHTML = '<div style="color:#aaa; font-size:12px; text-align:center;">Loading...</div>';

    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (capsules) => {
      if (!capsules || capsules.length === 0) {
        modal.innerHTML = '<div style="color:#aaa; font-size:12px; text-align:center;">No capsules found.</div>';
        return;
      }

      modal.innerHTML = '<div style="color:#fff; font-size:13px; font-weight:600; margin-bottom:4px;">Select to Inject</div>';

      capsules.forEach(capsule => {
        const item = document.createElement('div');
        item.textContent = capsule.title || 'Untitled Capsule';

        // Make draggable
        item.setAttribute('draggable', 'true');
        item.style.cssText = `
          padding: 8px;
          border-radius: 6px;
          background: #2a2a2a;
          color: #fff;
          font-size: 13px;
          cursor: grab;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: background 0.2s, opacity 0.2s;
          user-select: none;
          -webkit-user-drag: element;
        `;

        item.addEventListener('mouseenter', () => item.style.background = '#3a3a3a');
        item.addEventListener('mouseleave', () => item.style.background = '#2a2a2a');

        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', buildInjectionText(capsule));
          item.style.opacity = '0.5';
          modal.style.opacity = '0.3';
        });

        item.addEventListener('dragend', () => {
          item.style.opacity = '1';
          modal.style.opacity = '1';
        });

        item.addEventListener('click', () => {
          injectTextAndSend(buildInjectionText(capsule) || 'No content found.');
          modal.style.display = 'none';
        });

        modal.appendChild(item);
      });
    });
  });

  // Start tracking the chat input area
  trackInputArea();
}

function styleMenuOption(opt) {
  opt.style.cssText = `
    background: transparent;
    border: none;
    color: #fff;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    transition: background 0.2s;
  `;
  opt.addEventListener('mouseenter', () => opt.style.background = 'rgba(255,255,255,0.1)');
  opt.addEventListener('mouseleave', () => opt.style.background = 'transparent');
}

function trackInputArea() {
  const findInput = () => {
    // Selectors for chat inputs across platforms
    const selectors = [
      '#prompt-textarea',           // ChatGPT
      'textarea[data-id="root"]',   // Claude fallback
      'div.ProseMirror',            // Claude main
      'rich-textarea',              // Gemini
      '#chat-input',                // DeepSeek
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="ask" i]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  const updatePosition = () => {
    const input = findInput();
    if (input) {
      if (currentTextarea !== input) {
        currentTextarea = input;

        // Setup dropzone listeners on the input element
        input.addEventListener('dragover', (e) => {
          e.preventDefault();
          // Visual drop indicator: thin dashed purple outline (no layout shift)
          input.style.outline = '2px dashed #6c47ff';
          input.style.outlineOffset = '2px';
        });

        input.addEventListener('dragleave', () => {
          input.style.outline = '';
          input.style.outlineOffset = '';
        });

        input.addEventListener('drop', (e) => {
          e.preventDefault();
          input.style.outline = '';
          input.style.outlineOffset = '';
          const text = e.dataTransfer.getData('text/plain');
          if (text) {
            injectTextAndSend(text);
          }
        });
      }

      const rect = input.getBoundingClientRect();

      // Position just to the right of the input, slightly above the bottom
      buttonWrapper.style.display = 'flex';

      // Determine position based on platform
      if (location.hostname.includes('chatgpt.com') || location.hostname.includes('chat.openai.com')) {
        // Position outside the right side of the ChatGPT input bar
        // rect is the text area itself, which ends before the mic/send buttons. 
        // Adding ~110px pushes it past those buttons to sit cleanly on the right.
        buttonWrapper.style.left = `${rect.right + 110}px`;
        buttonWrapper.style.top = `${rect.bottom - 48}px`;
      } else if (location.hostname.includes('claude.ai')) {
        // Claude's ProseMirror editor is padded inside a card container.
        // We push it out by +24px to clear the outer card container border.
        buttonWrapper.style.left = `${rect.right + 24}px`;
        buttonWrapper.style.top = `${rect.bottom - 7}px`;
      } else if (location.hostname.includes('gemini.google.com')) {
        // Gemini's rich-textarea editor ends before the model dropdown and action buttons.
        // We push it out by +115px to sit cleanly outside on the right.
        buttonWrapper.style.left = `${rect.right + 162}px`;
        buttonWrapper.style.top = `${rect.bottom - 32}px`;
      } else if (location.hostname.includes('deepseek.com')) {
        // DeepSeek-specific position: lift it up to align with the vertical center of the card
        buttonWrapper.style.left = `${rect.right + 16}px`;
        buttonWrapper.style.top = `${rect.bottom - 58}px`;
      } else {
        // DeepSeek, etc.
        buttonWrapper.style.left = `${rect.right + 12}px`;
        buttonWrapper.style.top = `${rect.bottom - 40}px`;
      }
    } else {
      // Fallback: bottom right
      buttonWrapper.style.display = 'flex';
      buttonWrapper.style.left = 'auto';
      buttonWrapper.style.right = '20px';
      buttonWrapper.style.top = 'auto';
      buttonWrapper.style.bottom = '80px';
    }
    requestAnimationFrame(updatePosition);
  };

  updatePosition();
}

function injectTextAndSend(text) {
  if (currentTextarea) {
    currentTextarea.focus();

    // Inject text via standard command so it handles internal editor undo stack & state
    document.execCommand('insertText', false, text);

    // Trigger input event so React/Vue framework state matches DOM
    const event = new Event('input', { bubbles: true });
    currentTextarea.dispatchEvent(event);

    // Yield to the event loop so the host framework can process the input state, then auto-send
    setTimeout(() => {
      triggerSend();
    }, 150);
  } else {
    alert('Could not find an input box to inject into.');
  }
}

function triggerSend() {
  // Selector list to cover Claude, ChatGPT, Gemini, and DeepSeek send buttons
  const sendSelectors = [
    'button[data-testid="send-button"]',        // ChatGPT & Claude fallback
    'button[data-testid="composer-button"]',    // ChatGPT composer button
    'button[aria-label*="send" i]',              // General (matches Claude, Gemini, etc.)
    'button[class*="send" i]',                  // DeepSeek and custom chat layers
    'button[id*="send" i]',
    'div[role="button"][aria-label*="send" i]',
    '.send-button'
  ];

  for (const selector of sendSelectors) {
    const btn = document.querySelector(selector);
    if (btn && !btn.disabled) {
      btn.click();
      console.log('[Kairo] Auto-send triggered via action button.');
      return;
    }
  }

  // Fallback: dispatch keydown Enter to submit
  if (currentTextarea) {
    const enterDown = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });
    currentTextarea.dispatchEvent(enterDown);
    console.log('[Kairo] Auto-send fallback: Dispatched Enter keystroke.');
  }
}

// Inject global animation styles if not already present
if (!document.getElementById('kairo-global-styles')) {
  const styles = document.createElement('style');
  styles.id = 'kairo-global-styles';
  styles.textContent = `
    @keyframes kairo-fade-in {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes kairo-shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-4px); }
      40%, 80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(styles);
}

export function promptCapsuleName() {
  return new Promise((resolve) => {
    // Create backdrop overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(9, 9, 11, 0.7);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    // Create modal card
    const card = document.createElement('div');
    card.style.cssText = `
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      width: 380px;
      padding: 24px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
      color: #f4f4f5;
      display: flex;
      flex-direction: column;
      gap: 16px;
      animation: kairo-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: system-ui, -apple-system, sans-serif;
    `;

    // Header Title
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const icon = document.createElement('span');
    icon.textContent = 'K';
    icon.style.cssText = `
      font-size: 20px;
      background: linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Save Context Capsule';
    title.style.cssText = `
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
    `;

    header.appendChild(icon);
    header.appendChild(title);
    card.appendChild(header);

    // Label
    const desc = document.createElement('p');
    desc.textContent = 'Give this capsule a descriptive name to easily find and inject it later:';
    desc.style.cssText = `
      margin: 0;
      font-size: 13px;
      color: #a1a1aa;
      line-height: 1.5;
    `;
    card.appendChild(desc);

    // Input Field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g. NextJS Routing Issues, PhishGuard ML Pipeline';
    input.style.cssText = `
      background: #09090b;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 10px 12px;
      color: #fff;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    `;
    input.addEventListener('focus', () => {
      input.style.borderColor = '#6c47ff';
      input.style.boxShadow = '0 0 0 2px rgba(108, 71, 255, 0.2)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#27272a';
      input.style.boxShadow = 'none';
    });
    card.appendChild(input);

    // Error Message
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      color: #ef4444;
      font-size: 12px;
      display: none;
      margin-top: -8px;
    `;
    card.appendChild(errorMsg);

    // Action Buttons Row
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: transparent;
      border: 1px solid #27272a;
      border-radius: 8px;
      padding: 8px 16px;
      color: #d4d4d8;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#27272a';
      cancelBtn.style.color = '#fff';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.color = '#d4d4d8';
    });

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Capsule';
    saveBtn.style.cssText = `
      background: linear-gradient(135deg, #6c47ff 0%, #8b6aff 100%);
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(108, 71, 255, 0.3);
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    saveBtn.addEventListener('mouseenter', () => {
      saveBtn.style.transform = 'translateY(-1px)';
      saveBtn.style.boxShadow = '0 6px 16px rgba(108, 71, 255, 0.4)';
    });
    saveBtn.addEventListener('mouseleave', () => {
      saveBtn.style.transform = 'none';
      saveBtn.style.boxShadow = '0 4px 12px rgba(108, 71, 255, 0.3)';
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Auto-focus input
    setTimeout(() => {
      overlay.style.opacity = '1';
      input.focus();
    }, 50);

    const closeModal = (val) => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(overlay);
        resolve(val);
      }, 200);
    };

    // Close logic
    cancelBtn.addEventListener('click', () => closeModal(null));

    // Save logic
    const handleSave = () => {
      const val = input.value.trim();
      if (!val) {
        // Shake animation and show error
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.2)';
        input.style.animation = 'kairo-shake 0.3s ease';
        errorMsg.textContent = 'Capsule name is required.';
        errorMsg.style.display = 'block';

        setTimeout(() => {
          input.style.animation = 'none';
        }, 300);
        return;
      }
      closeModal(val);
    };

    saveBtn.addEventListener('click', handleSave);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleSave();
      } else if (e.key === 'Escape') {
        closeModal(null);
      }
    });
  });
}

