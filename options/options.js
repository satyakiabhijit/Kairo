// options/options.js — Kairo Settings Page (Preact + htm)

import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';

function OptionsPage() {
  const [settings, setSettings] = useState({
    apiKey: '',
    autoEnrich: false,
    showFloatingButton: true,
  });
  const [toastMsg, setToastMsg] = useState('');
  const [capsuleCount, setCapsuleCount] = useState(0);
  const [saved, setSaved] = useState(false);

  // Load settings + capsule count on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] GET_SETTINGS failed:', chrome.runtime.lastError.message);
        return;
      }
      if (res && typeof res === 'object') {
        setSettings(prev => ({ ...prev, ...res }));
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] GET_CAPSULES failed:', chrome.runtime.lastError.message);
        return;
      }
      if (Array.isArray(res)) {
        setCapsuleCount(res.length);
      }
    });
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Save settings
  const handleSave = () => {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] SAVE_SETTINGS failed:', chrome.runtime.lastError.message);
        showToast('Failed to save settings');
        return;
      }
      if (res?.success) {
        showToast('Settings saved successfully');
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        showToast('Failed to save settings');
      }
    });
  };

  // Export all capsules as JSON
  const handleExport = () => {
    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (capsules) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] GET_CAPSULES failed:', chrome.runtime.lastError.message);
        showToast('Export failed');
        return;
      }
      if (!Array.isArray(capsules) || capsules.length === 0) {
        showToast('No capsules to export');
        return;
      }

      const data = JSON.stringify({
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        app: 'Kairo',
        capsules,
      }, null, 2);

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kairo-capsules-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${capsules.length} capsules`);
    });
  };

  // Import capsules from JSON
  const handleImport = () => {
    document.getElementById('import-file').click();
  };

  const processImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const capsules = parsed.capsules || parsed;

        if (!Array.isArray(capsules)) {
          showToast('Invalid file format');
          return;
        }

        let imported = 0;
        const saveNext = (i) => {
          if (i >= capsules.length) {
            showToast(`Imported ${imported} capsules`);
            setCapsuleCount(prev => prev + imported);
            return;
          }
          chrome.runtime.sendMessage({
            type: 'SAVE_CAPSULE',
            capsule: capsules[i],
            options: { enrich: false },
          }, (res) => {
            if (chrome.runtime.lastError) {
              console.error('[Kairo Options] SAVE_CAPSULE failed:', chrome.runtime.lastError.message);
            } else if (res?.success) {
              imported++;
            }
            saveNext(i + 1);
          });
        };

        saveNext(0);
      } catch (err) {
        console.error('[Kairo Options] Import error:', err);
        showToast('Failed to parse import file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset file input
  };

  // Clear all data
  const handleClearAll = () => {
    if (!confirm('This will permanently delete all capsules. Are you sure?')) return;
    if (!confirm('This is your last chance. Delete everything?')) return;

    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] CLEAR_ALL failed:', chrome.runtime.lastError.message);
        showToast('Failed to clear data');
        return;
      }
      if (res?.success) {
        setCapsuleCount(0);
        showToast('All capsules deleted');
      } else {
        showToast('Failed to clear data');
      }
    });
  };

  return html`
    <div class="options-container">

      <!-- Header -->
      <div class="options-header" style="display: flex; align-items: center; gap: 14px; margin-bottom: 40px;">
        <img src="../assets/brand-logo.png" style="width: 46px; height: 46px; object-fit: contain; filter: brightness(0) invert(1);" />
        <div>
          <h1 style="font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; background: linear-gradient(135deg, #6c47ff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Kairo Settings</h1>
          <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5;">Configure your AI context capture workflow. ${capsuleCount > 0 ? `You have ${capsuleCount} saved capsules.` : ''}</p>
        </div>
      </div>

      <!-- API Key Section -->
      <div class="section" id="section-api">
        <div class="section-title">Claude API Key</div>
        <div class="section-desc">
          Required for AI-powered context enrichment. Your key is stored securely in browser sync storage and never sent to any server except Anthropic's API.
        </div>
        <div class="field">
          <label class="field-label" for="api-key-input">API Key</label>
          <input
            class="text-input"
            type="password"
            id="api-key-input"
            placeholder="sk-ant-api03-..."
            value=${settings.apiKey}
            onInput=${e => setSettings({ ...settings, apiKey: e.target.value })}
          />
        </div>
      </div>

      <!-- Toggles Section -->
      <div class="section" id="section-toggles">
        <div class="section-title">Behavior</div>
        <div class="section-desc">Control how Kairo works on AI chat pages.</div>

        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-label">Auto-enrich on capture</div>
            <div class="toggle-desc">Automatically extract goals, stack, and key decisions using Claude API when saving a capsule.</div>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked=${settings.autoEnrich}
              onChange=${e => setSettings({ ...settings, autoEnrich: e.target.checked })}
              id="toggle-auto-enrich"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="toggle-row">
          <div class="toggle-info">
            <div class="toggle-label">Show floating capture button</div>
            <div class="toggle-desc">Display the capture button on supported AI chat pages. You can still use Ctrl+Shift+S even if this is off.</div>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked=${settings.showFloatingButton}
              onChange=${e => setSettings({ ...settings, showFloatingButton: e.target.checked })}
              id="toggle-floating-btn"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <!-- Save Button -->
      <div style="margin-bottom: 20px;">
        <button class="btn btn-primary" onClick=${handleSave} id="save-settings-btn">
          ${saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <!-- Data Management -->
      <div class="section" id="section-data">
        <div class="section-title">Data Management</div>
        <div class="section-desc">Export your capsules for backup or import from a previous export.</div>
        <div class="btn-row">
          <button class="btn" onClick=${handleExport} id="export-btn">
            Export All Capsules
          </button>
          <button class="btn" onClick=${handleImport} id="import-btn">
            Import from JSON
          </button>
          <input
            class="file-input"
            type="file"
            id="import-file"
            accept=".json"
            onChange=${processImport}
          />
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="section danger-section" id="section-danger">
        <div class="section-title">Danger Zone</div>
        <div class="section-desc">Irreversible actions. Proceed with caution.</div>
        <button class="btn btn-danger" onClick=${handleClearAll} id="clear-all-btn">
          Delete All Capsules
        </button>
      </div>

      <!-- Keyboard Shortcuts Info -->
      <div class="section" id="section-shortcuts">
        <div class="section-title">Keyboard Shortcuts</div>
        <div class="section-desc">Quick access shortcuts for Kairo.</div>
        <div class="toggle-row" style="border-bottom: none;">
          <div class="toggle-info">
            <div class="toggle-label">Capture current chat</div>
            <div class="toggle-desc">Works on any supported AI platform page.</div>
          </div>
          <code style="
            background: var(--bg-input);
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 11px;
            color: var(--accent);
            border: 1px solid var(--border-subtle);
            white-space: nowrap;
          ">Ctrl+Shift+S</code>
        </div>
      </div>

      <!-- Version Footer -->
      <div class="version-footer">
        Kairo v1.0.0 - Built for context that travels with you.
      </div>
    </div>

    <!-- Toast -->
    ${toastMsg && html`<div class="toast">${toastMsg}</div>`}
  `;
}

render(html`<${OptionsPage} />`, document.getElementById('root'));
