// options/options.js — Kairo Settings Page (Preact + htm)

import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { t } from '../shared/i18n.js';

function OptionsPage() {
  const [settings, setSettings] = useState({
    apiKey: '',
    autoEnrich: false,
    showFloatingButton: true,
    locale: 'en',
    theme: 'dark',
    autoTag: false,
    notionEnabled: false,
    notionToken: '',
    notionDbId: '',
    experimentalMerge: false,
    experimentalDebug: false,
  });
  const [toastMsg, setToastMsg] = useState('');
  const [capsuleCount, setCapsuleCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Load settings + capsule count on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res && typeof res === 'object') {
        setSettings(prev => ({ ...prev, ...res }));
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (res) => {
      if (Array.isArray(res)) {
        setCapsuleCount(res.length);
      }
    });
  }, []);

  // Persist theme class on body
  useEffect(() => {
    document.body.className = settings.theme === 'light' ? 'light-theme' : '';
  }, [settings.theme]);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Save settings
  const handleSave = () => {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Options] Save settings failed:', chrome.runtime.lastError.message);
        showToast(t('toastSettingsSaveFailed', settings.locale));
        return;
      }
      if (res?.success) {
        showToast(t('toastSettingsSaved', settings.locale));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        showToast(t('toastSettingsSaveFailed', settings.locale));
      }
    });
  };

  // Export all capsules as JSON
  const handleExport = () => {
    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (capsules) => {
      if (!Array.isArray(capsules) || capsules.length === 0) {
        showToast(t('toastNoCapsulesExport', settings.locale));
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
      showToast(t('toastExportSuccess', settings.locale, { count: capsules.length }));
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
          showToast(t('toastImportInvalid', settings.locale));
          return;
        }

        let imported = 0;
        const saveNext = (i) => {
          if (i >= capsules.length) {
            showToast(t('toastImportSuccess', settings.locale, { count: imported }));
            setCapsuleCount(prev => prev + imported);
            return;
          }
          chrome.runtime.sendMessage({
            type: 'SAVE_CAPSULE',
            capsule: capsules[i],
            options: { enrich: false },
          }, (res) => {
            if (res?.success) imported++;
            saveNext(i + 1);
          });
        };

        saveNext(0);
      } catch (err) {
        console.error('[Kairo Options] Import error:', err);
        showToast(t('toastImportFailed', settings.locale));
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset file input
  };

  // Clear all data
  const handleClearAll = () => {
    if (!confirm(t('deleteConfirmText', settings.locale))) return;
    if (!confirm('This is your last chance. Delete everything?')) return;

    chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (res) => {
      if (res?.success) {
        setCapsuleCount(0);
        showToast(t('toastClearSuccess', settings.locale));
      } else {
        showToast(t('toastClearFailed', settings.locale));
      }
    });
  };

  const loc = settings.locale;

  return html`
    <div class="options-container">

      <!-- Header -->
      <div class="options-header" style="display: flex; align-items: center; gap: 14px; margin-bottom: 30px;">
        <img src="../assets/brand-logo.png" style="width: 46px; height: 46px; object-fit: contain; filter: brightness(0) invert(1);" />
        <div>
          <h1 style="font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; background: linear-gradient(135deg, #6c47ff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            ${t('settingsTitle', loc)}
          </h1>
          <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
            ${t('settingsDescCount', loc, { count: capsuleCount })}
          </p>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div style="
        display: flex;
        gap: 8px;
        margin-bottom: 24px;
        border-bottom: 1px solid var(--border-subtle);
        padding-bottom: 10px;
      ">
        <button 
          style="
            background: ${activeTab === 'general' ? 'var(--accent)' : 'transparent'};
            color: ${activeTab === 'general' ? '#fff' : 'var(--text-secondary)'};
            border: 1px solid ${activeTab === 'general' ? 'var(--accent)' : 'var(--border-subtle)'};
            padding: 8px 16px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition);
          "
          onClick=${() => setActiveTab('general')}
          id="tab-btn-general"
        >
          ${t('tabGeneral', loc)}
        </button>
        <button 
          style="
            background: ${activeTab === 'advanced' ? 'var(--accent)' : 'transparent'};
            color: ${activeTab === 'advanced' ? '#fff' : 'var(--text-secondary)'};
            border: 1px solid ${activeTab === 'advanced' ? 'var(--accent)' : 'var(--border-subtle)'};
            padding: 8px 16px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all var(--transition);
          "
          onClick=${() => setActiveTab('advanced')}
          id="tab-btn-advanced"
        >
          ${t('tabAdvanced', loc)}
        </button>
      </div>

      <!-- General Tab Content -->
      ${activeTab === 'general' && html`
        <div>
          <!-- API Key Section -->
          <div class="section" id="section-api">
            <div class="section-title">${t('claudeApiKeySection', loc)}</div>
            <div class="section-desc">
              ${t('claudeApiKeyDesc', loc)}
            </div>
            <div class="field">
              <label class="field-label" for="api-key-input">${t('apiKeyField', loc)}</label>
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

          <!-- Behavior Section -->
          <div class="section" id="section-toggles">
            <div class="section-title">${t('behaviorSection', loc)}</div>
            <div class="section-desc">${t('behaviorDesc', loc)}</div>

            <!-- Auto-enrich toggle -->
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="toggle-label">${t('autoEnrichField', loc)}</div>
                <div class="toggle-desc">${t('autoEnrichDesc', loc)}</div>
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

            <!-- Auto-tag toggle -->
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="toggle-label">${t('autoTagField', loc)}</div>
                <div class="toggle-desc">${t('autoTagDesc', loc)}</div>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked=${settings.autoTag}
                  onChange=${e => setSettings({ ...settings, autoTag: e.target.checked })}
                  id="toggle-auto-tag"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <!-- Show floating button toggle -->
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="toggle-label">${t('showFloatingBtnField', loc)}</div>
                <div class="toggle-desc">${t('showFloatingBtnDesc', loc)}</div>
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

          <!-- Localization & Theme Section -->
          <div class="section" id="section-appearance">
            <div class="section-title">${t('languageField', loc)} & ${t('themeField', loc)}</div>
            <div class="section-desc">Customize language and visual preferences.</div>

            <!-- Language Dropdown -->
            <div class="toggle-row" style="border-bottom: 1px solid var(--border-subtle);">
              <div class="toggle-info">
                <div class="toggle-label">${t('languageField', loc)}</div>
                <div class="toggle-desc">${t('languageDesc', loc)}</div>
              </div>
              <select 
                class="text-input" 
                style="width: 140px; background: var(--bg-input); color: var(--text-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); padding: 6px;"
                value=${settings.locale}
                onChange=${e => setSettings({ ...settings, locale: e.target.value })}
                id="select-locale"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>

            <!-- Theme Dropdown -->
            <div class="toggle-row" style="border-bottom: none; padding-bottom: 0;">
              <div class="toggle-info">
                <div class="toggle-label">${t('themeField', loc)}</div>
                <div class="toggle-desc">${t('themeDesc', loc)}</div>
              </div>
              <select 
                class="text-input" 
                style="width: 140px; background: var(--bg-input); color: var(--text-primary); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); padding: 6px;"
                value=${settings.theme}
                onChange=${e => setSettings({ ...settings, theme: e.target.value })}
                id="select-theme"
              >
                <option value="dark">${t('themeDark', loc)}</option>
                <option value="light">${t('themeLight', loc)}</option>
              </select>
            </div>
          </div>
        </div>
      `}

      <!-- Advanced Tab Content -->
      ${activeTab === 'advanced' && html`
        <div>
          <!-- Notion Integration Section -->
          <div class="section" id="section-notion">
            <div class="section-title">${t('notionSection', loc)}</div>
            <div class="section-desc">${t('notionSectionDesc', loc)}</div>

            <!-- Enable Toggle -->
            <div class="toggle-row" style="border-bottom: 1px solid var(--border-subtle); margin-bottom: 12px;">
              <div class="toggle-info">
                <div class="toggle-label">${t('notionEnabledField', loc)}</div>
                <div class="toggle-desc">${t('notionEnabledDesc', loc)}</div>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked=${settings.notionEnabled}
                  onChange=${e => setSettings({ ...settings, notionEnabled: e.target.checked })}
                  id="toggle-notion-enabled"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            ${settings.notionEnabled && html`
              <div>
                <div class="field">
                  <label class="field-label" for="notion-token-input">${t('notionTokenField', loc)}</label>
                  <input
                    class="text-input"
                    type="password"
                    id="notion-token-input"
                    placeholder="secret_..."
                    value=${settings.notionToken}
                    onInput=${e => setSettings({ ...settings, notionToken: e.target.value })}
                  />
                </div>
                <div class="field">
                  <label class="field-label" for="notion-db-input">${t('notionDbIdField', loc)}</label>
                  <input
                    class="text-input"
                    type="text"
                    id="notion-db-input"
                    placeholder="e.g. 8c5b..."
                    value=${settings.notionDbId}
                    onInput=${e => setSettings({ ...settings, notionDbId: e.target.value })}
                  />
                </div>
              </div>
            `}
          </div>

          <!-- Experimental Features Section -->
          <div class="section" id="section-experimental">
            <div class="section-title">${t('experimentalFeaturesSection', loc)}</div>
            <div class="section-desc">${t('experimentalFeaturesDesc', loc)}</div>

            <!-- Deep Merge Toggle -->
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="toggle-label">Deep merge manifest configuration overrides</div>
                <div class="toggle-desc">Enable recursive merging for Vite build config objects.</div>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked=${settings.experimentalMerge}
                  onChange=${e => setSettings({ ...settings, experimentalMerge: e.target.checked })}
                  id="toggle-exp-merge"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <!-- Debug Logs Toggle -->
            <div class="toggle-row">
              <div class="toggle-info">
                <div class="toggle-label">Verbose debug logs</div>
                <div class="toggle-desc">Output execution trace information directly to the service worker console.</div>
              </div>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked=${settings.experimentalDebug}
                  onChange=${e => setSettings({ ...settings, experimentalDebug: e.target.checked })}
                  id="toggle-exp-debug"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Data Management -->
          <div class="section" id="section-data">
            <div class="section-title">${t('dataManagementSection', loc)}</div>
            <div class="section-desc">${t('dataManagementDesc', loc)}</div>
            <div class="btn-row">
              <button class="btn" onClick=${handleExport} id="export-btn">
                ${t('exportBtn', loc)}
              </button>
              <button class="btn" onClick=${handleImport} id="import-btn">
                ${t('importBtn', loc)}
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
            <div class="section-title">${t('dangerZoneSection', loc)}</div>
            <div class="section-desc">${t('dangerZoneDesc', loc)}</div>
            <button class="btn btn-danger" onClick=${handleClearAll} id="clear-all-btn">
              ${t('clearAllBtn', loc)}
            </button>
          </div>

          <!-- Keyboard Shortcuts Info -->
          <div class="section" id="section-shortcuts">
            <div class="section-title">${t('keyboardShortcutsSection', loc)}</div>
            <div class="section-desc">${t('keyboardShortcutsDesc', loc)}</div>
            <div class="toggle-row" style="border-bottom: none; padding-bottom: 0;">
              <div class="toggle-info">
                <div class="toggle-label">${t('captureCurrentChatField', loc)}</div>
                <div class="toggle-desc">${t('captureCurrentChatDesc', loc)}</div>
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
        </div>
      `}

      <!-- Save Button -->
      <div style="margin-top: 10px; margin-bottom: 30px;">
        <button class="btn btn-primary" onClick=${handleSave} id="save-settings-btn">
          ${saved ? t('savedBtn', loc) : t('saveSettingsBtn', loc)}
        </button>
      </div>

      <!-- Version Footer -->
      <div class="version-footer">
        ${t('versionFooter', loc)}
      </div>
    </div>

    <!-- Toast -->
    ${toastMsg && html`<div class="toast">${toastMsg}</div>`}
  `;
}

render(html`<${OptionsPage} />`, document.getElementById('root'));
