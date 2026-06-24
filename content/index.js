// content/index.js — Entry point: detects platform, loads extractor, injects capture button

import { getExtractor } from './extractors/index.js';
import { injectButton, promptCapsuleName } from './injector.js';
import { createCapsule } from '../shared/capsule.js';

(async function init() {
  try {
    const extractor = getExtractor(location.hostname);

    if (!extractor) {
      console.log('[Kairo] Unsupported platform:', location.hostname);
      return;
    }

    console.log(`[Kairo] Detected platform: ${extractor.platform}`);

    // Check settings (graceful fallback)
    let autoEnrich = false;
    try {
      const settings = await chrome.storage.sync.get('kairo_settings');
      const showButton = settings.kairo_settings?.showFloatingButton !== false;
      autoEnrich = settings.kairo_settings?.autoEnrich === true;

      if (!showButton) {
        console.log('[Kairo] Floating button disabled in settings');
        return;
      }
    } catch (settingsErr) {
      console.warn('[Kairo] Could not read settings, using defaults:', settingsErr);
    }

    // Inject the capture button
    injectButton(async () => {
      // Ask user for capsule name using modern custom modal
      const customTitle = await promptCapsuleName();
      if (customTitle === null) {
        console.log('[Kairo] Capture cancelled by user.');
        return false; // Tells injector to reset cleanly without showing error
      }
      const capsuleTitle = customTitle;

      // STEP 1: Extract turns
      console.log('[Kairo] Step 1: Extracting turns...');
      let turns;
      try {
        turns = extractor.extract();
        console.log(`[Kairo] Step 1 result: ${turns?.length || 0} turns extracted`);
      } catch (extractErr) {
        console.error('[Kairo] Step 1 FAILED - extractor error:', extractErr);
        const bodyText = document.body?.innerText?.trim() || '';
        if (bodyText.length > 50) {
          turns = [{ role: 'user', text: bodyText.slice(0, 8000) }];
          console.log('[Kairo] Step 1 recovery: using body text fallback');
        } else {
          throw new Error('Extractor failed: ' + (extractErr.message || 'unknown'));
        }
      }

      if (!turns || !turns.length) {
        throw new Error('No conversation turns found on this page');
      }

      // STEP 2: Build capsule
      console.log('[Kairo] Step 2: Building capsule...');

      // Guard: cap payload size — long ChatGPT threads can overflow IPC
      const MAX_TURNS = 30;
      const MAX_TURN_TEXT = 3000;
      const safeTurns = turns
        .slice(-MAX_TURNS)                          // keep most recent turns
        .map(t => ({ role: t.role, text: t.text.slice(0, MAX_TURN_TEXT) }));

      console.log(`[Kairo] Step 2: using ${safeTurns.length} turns (capped from ${turns.length})`);
      const snippet = safeTurns.map(t => `[${t.role}]: ${t.text}`).join('\n\n');

      let capsule;
      try {
        capsule = createCapsule({
          source: extractor.platform,
          url: location.href,
          title: capsuleTitle,
          content: {
            rawTurns: safeTurns,
            rawSnippet: snippet.slice(-4000),
            summary: '',
            goals: [],
            constraints: [],
            stack: [],
            keyDecisions: [],
          },
        });
        console.log(`[Kairo] Step 2 result: capsule ${capsule.id} created`);
      } catch (capsuleErr) {
        console.error('[Kairo] Step 2 FAILED:', capsuleErr);
        throw new Error('Capsule creation failed: ' + (capsuleErr.message || 'unknown'));
      }

      // STEP 3: Send to background
      console.log('[Kairo] Step 3: Sending to service worker...');
      let result;
      try {
        result = await chrome.runtime.sendMessage({
          type: 'SAVE_CAPSULE',
          capsule,
          options: { enrich: autoEnrich },
        });
        console.log('[Kairo] Step 3 result:', JSON.stringify(result).slice(0, 200));
      } catch (msgErr) {
        console.error('[Kairo] Step 3 FAILED - message error:', msgErr);
        throw new Error('Service worker unreachable: ' + (msgErr.message || 'unknown'));
      }

      // STEP 4: Validate response
      if (!result) {
        console.error('[Kairo] Step 4 FAILED: result is null/undefined');
        throw new Error('No response from service worker');
      }

      if (!result.success) {
        const errorDetail = result.error || result.errors?.join(', ') || 'Unknown save error';
        console.error('[Kairo] Step 4 FAILED:', errorDetail);
        throw new Error(errorDetail);
      }

      console.log(`[Kairo] ✓ Capsule saved successfully: ${result.capsule?.title || capsule.id}`);
      return result;
    });

    console.log('[Kairo] Content script initialized');
  } catch (err) {
    console.error('[Kairo] Content script init error:', err);
  }
})();
