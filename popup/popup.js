// popup/popup.js — Kairo Popup UI (Preact + htm)

import { h, render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { html } from 'htm/preact';
import { timeAgo, truncate, platformName } from '../shared/utils.js';
import { buildInjectionText } from '../shared/inject.js';
import { t } from '../shared/i18n.js';

function buildFolderTree(folders) {
  const root = {};
  folders.forEach(f => {
    const parts = f.split('/');
    let current = root;
    parts.forEach(part => {
      if (!current[part]) {
        current[part] = { name: part, fullPath: '', children: {} };
      }
      current = current[part].children;
    });
  });
  const setPaths = (node, parentPath = '') => {
    Object.keys(node).forEach(key => {
      const path = parentPath ? `${parentPath}/${key}` : key;
      node[key].fullPath = path;
      setPaths(node[key].children, path);
    });
  };
  setPaths(root);
  return root;
}

function highlightMatch(text, query) {
  if (!text) return '';
  if (!query || !query.trim()) return text;
  const q = query.trim();
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) return text;

  const parts = [];
  let current = text;
  while (true) {
    const idx = current.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) {
      parts.push(current);
      break;
    }
    parts.push(current.slice(0, idx));
    parts.push(html`<mark style="background: rgba(108, 71, 255, 0.25); color: inherit; padding: 0 2px; border-radius: 2px;">${current.slice(idx, idx + q.length)}</mark>`);
    current = current.slice(idx + q.length);
  }
  return parts;
}

// ─── Main Popup Component ───────────────────────────────────────
function Popup() {
  const [capsules, setCapsules] = useState([]);
  const [query, setQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState(null);
  const [activePlatform, setActivePlatform] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    locale: 'en',
    theme: 'dark',
    notionEnabled: false,
  });
  const [activeDateFilter, setActiveDateFilter] = useState('all');
  const [folderQuery, setFolderQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState({});

  const toggleFolder = useCallback((path) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const renderFolderNode = (node, depth = 0) => {
    return Object.values(node).map(item => {
      const hasChildren = Object.keys(item.children).length > 0;
      const isExpanded = expandedFolders[item.fullPath];
      const isSelected = activeFolder === item.fullPath;
      return html`
        <div key=${item.fullPath} style="margin-left: ${depth * 8}px; display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center; gap: 4px; padding: 2px 0;">
            ${hasChildren ? html`
              <button 
                class="icon-btn" 
                style="padding: 2px; font-size: 8px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center;" 
                onClick=${(e) => { e.stopPropagation(); toggleFolder(item.fullPath); }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: ${isExpanded ? 'rotate(90deg)' : 'none'}; transition: transform 0.15s ease;">
                  <path d="M9 18l6-6-6-6"></path>
                </svg>
              </button>
            ` : html`<span style="width: 14px;"></span>`}
            <button
              class="filter-chip ${isSelected ? 'active' : ''}"
              onClick=${() => setActiveFolder(isSelected ? null : item.fullPath)}
              style="padding: 2px 6px; font-size: 11px; margin: 2px 0; border-radius: var(--radius-sm);"
            >
              ${item.name}
            </button>
          </div>
          ${hasChildren && isExpanded && html`
            <div style="border-left: 1px solid var(--border-subtle); margin-left: 6px;">
              ${renderFolderNode(item.children, depth + 1)}
            </div>
          `}
        </div>
      `;
    });
  };

  // Load settings + capsules on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res && typeof res === 'object') {
        let theme = res.theme;
        if (!res.hasOwnProperty('theme')) {
          theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        setSettings(prev => ({ ...prev, ...res, theme }));
        document.body.className = theme === 'light' ? 'light-theme' : '';
      } else {
        const theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        setSettings(prev => ({ ...prev, theme }));
        document.body.className = theme === 'light' ? 'light-theme' : '';
      }
    });

    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (response) => {
      if (Array.isArray(response)) {
        setCapsules(response);
      }
      setLoading(false);
    });
  }, []);

  // Trigger weekly backup if enabled and due
  useEffect(() => {
    if (loading || !settings.autoBackup) return;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - (settings.lastBackupTime || 0) >= sevenDays) {
      if (capsules.length > 0) {
        const dataStr = JSON.stringify({
          version: '1.0.0',
          exportedAt: Date.now(),
          capsules
        }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kairo-weekly-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const updatedSettings = { ...settings, lastBackupTime: Date.now() };
        chrome.runtime.sendMessage({
          type: 'SAVE_SETTINGS',
          settings: updatedSettings
        }, () => {
          setSettings(updatedSettings);
          showToast(settings.locale === 'es' ? 'Copia de seguridad semanal exportada' : 'Weekly backup exported automatically');
        });
      }
    }
  }, [loading, settings.autoBackup, settings.lastBackupTime, capsules, settings.locale]);

  const loc = settings.locale;

  // Filter logic
  const filtered = capsules.filter(c => {
    const q = query.trim().toLowerCase();
    const matchQuery = !q ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.content?.summary || '').toLowerCase().includes(q) ||
      (c.content?.rawSnippet || '').toLowerCase().includes(q) ||
      (c.meta?.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (c.content?.goals || []).some(g => g.toLowerCase().includes(q)) ||
      (c.content?.stack || []).some(s => s.toLowerCase().includes(q)) ||
      (c.content?.constraints || []).some(co => co.toLowerCase().includes(q)) ||
      (c.content?.keyDecisions || []).some(kd => kd.toLowerCase().includes(q));
    const matchFolder = activeFolder ? c.meta?.folder === activeFolder : true;
    const matchPlatform = activePlatform ? c.source === activePlatform : true;

    const matchDate = (() => {
      if (activeDateFilter === 'all') return true;
      const ageMs = Date.now() - (c.capturedAt || 0);
      if (activeDateFilter === 'today') return ageMs < 24 * 60 * 60 * 1000;
      if (activeDateFilter === 'yesterday') return ageMs >= 24 * 60 * 60 * 1000 && ageMs < 48 * 60 * 60 * 1000;
      if (activeDateFilter === 'week') return ageMs < 7 * 24 * 60 * 60 * 1000;
      if (activeDateFilter === 'month') return ageMs < 30 * 24 * 60 * 60 * 1000;
      return true;
    })();

    return matchQuery && matchFolder && matchPlatform && matchDate;
  });

  // Sort: pinned first, then by capturedAt desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.meta?.pinned && !b.meta?.pinned) return -1;
    if (!a.meta?.pinned && b.meta?.pinned) return 1;
    return (b.capturedAt || 0) - (a.capturedAt || 0);
  });

  const folders = [...new Set(capsules.map(c => c.meta?.folder).filter(Boolean))];
  const platforms = [...new Set(capsules.map(c => c.source).filter(Boolean))];

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2000);
  };

  // ─── Copy to clipboard ─────────────────────────────────────
  const handleCopy = useCallback(async (capsule, options = {}) => {
    try {
      const text = buildInjectionText(capsule, settings.injectionTemplate, options);
      await navigator.clipboard.writeText(text);
      showToast(t('toastCopied', loc));
    } catch (err) {
      console.error('[Kairo Popup] Copy failed:', err);
      showToast(t('toastCopyFailed', loc));
    }
  }, [loc, settings.injectionTemplate]);

  // ─── Copy raw transcript ───────────────────────────────────
  const handleCopyRaw = useCallback(async (capsule) => {
    try {
      const turns = capsule.content?.rawTurns || [];
      const text = turns.map(t => `[${t.role.toUpperCase()}]: ${t.text}`).join('\n\n');
      await navigator.clipboard.writeText(text);
      showToast(loc === 'es' ? 'Transcripción copiada' : 'Raw transcript copied');
    } catch (err) {
      console.error('[Kairo Popup] Copy raw failed:', err);
      showToast(loc === 'es' ? 'Error al copiar' : 'Copy failed');
    }
  }, [loc]);

  // ─── Inject into active tab ────────────────────────────────
  const handleInject = useCallback(async (capsule, options = {}) => {
    try {
      const contextText = buildInjectionText(capsule, settings.injectionTemplate, options);

      chrome.runtime.sendMessage({
        type: 'INJECT_CONTEXT',
        contextText,
      }, (res) => {
        if (res?.success) {
          showToast(t('toastInjected', loc));
        } else {
          showToast(t('toastInjectFailed', loc));
        }
      });
    } catch (err) {
      console.error('[Kairo Popup] Inject failed:', err);
      showToast(t('toastInjectFailed', loc));
    }
  }, [loc, settings.injectionTemplate]);

  // ─── Notion Export ─────────────────────────────────────────
  const handleNotionExport = useCallback((id) => {
    showToast('Exporting to Notion...');
    chrome.runtime.sendMessage({ type: 'EXPORT_TO_NOTION', id }, (res) => {
      if (res?.success) {
        showToast('Exported to Notion!');
      } else {
        showToast(res?.error || 'Notion export failed');
      }
    });
  }, []);

  // ─── Pin/Unpin Capsule ──────────────────────────────────────
  const handlePin = useCallback((c) => {
    const isPinned = !c.meta?.pinned;
    const updatedMeta = { ...(c.meta || {}), pinned: isPinned };
    chrome.runtime.sendMessage({
      type: 'UPDATE_CAPSULE',
      id: c.id,
      updates: { meta: updatedMeta },
    }, (res) => {
      if (res?.success) {
        setCapsules(prev => prev.map(cap => cap.id === c.id ? { ...cap, meta: updatedMeta } : cap));
        showToast(isPinned ? 'Capsule pinned' : 'Capsule unpinned');
      }
    });
  }, []);

  // ─── Delete capsule ────────────────────────────────────────
  const handleDelete = useCallback((id) => {
    chrome.runtime.sendMessage({ type: 'DELETE_CAPSULE', id }, (res) => {
      if (res?.success) {
        setCapsules(prev => prev.filter(c => c.id !== id));
        showToast(t('toastDeleted', loc));
      }
      setDeleteTarget(null);
    });
  }, [loc]);

  // ─── Export all capsules as JSON ───────────────────────────
  const handleExport = () => {
    if (capsules.length === 0) {
      showToast(t('toastNoCapsulesExport', loc));
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
    showToast(t('toastExportSuccess', loc, { count: capsules.length }));
  };

  // ─── Export single capsule as JSON ─────────────────────────
  const handleExportSingle = (c) => {
    // Sanitize title to prevent filename encoding failures
    const sanitizedTitle = (c.title || 'capsule').replace(/[\/\\?%*:|"<>\s]+/g, '_').toLowerCase();
    const data = JSON.stringify(c, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kairo-capsule-${sanitizedTitle}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Capsule exported');
  };

  // ─── Open options page ─────────────────────────────────────
  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const getCapsulesCountText = () => {
    if (sorted.length === 0) return t('capsulesCountZero', loc);
    if (sorted.length === 1) return t('capsulesCountOne', loc);
    return t('capsulesCountMany', loc, { count: sorted.length });
  };

  const tagMatch = query.match(/#([^\s#]*)$/);
  const allTags = [...new Set(capsules.flatMap(c => c.meta?.tags || []))];
  const suggestedTags = tagMatch ? allTags.filter(t => t.toLowerCase().includes(tagMatch[1].toLowerCase())) : [];

  // ─── Render ─────────────────────────────────────────────────
  return html`
    <!-- Header -->
    <div class="kairo-header">
      <h1 style="display: flex; align-items: center; gap: 8px;">
        <img src="../assets/brand-logo.png" style="width: 22px; height: 22px; object-fit: contain; filter: brightness(0) invert(1);" />
        Kairo
      </h1>
      <div class="header-actions">
        <button class="icon-btn" onClick=${handleExport} title="Export" id="kairo-export-btn"><i class="fa-solid fa-download" style="color: rgb(138, 152, 177);"></i></button>
        <button class="icon-btn" onClick=${openOptions} title=${t('settingsTitle', loc)} id="kairo-settings-btn"><i class="fa-solid fa-gear" style="color: rgb(138, 152, 177);"></i></button>
      </div>
    </div>

    <!-- Search -->
    <div class="search-container" style="position: relative;">
      <div class="search-wrapper">
        <span class="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </span>
        <input
          class="search-input"
          type="text"
          placeholder=${t('searchPlaceholder', loc)}
          value=${query}
          onInput=${e => setQuery(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') e.preventDefault(); }}
          id="kairo-search"
        />
      </div>

      ${suggestedTags.length > 0 && html`
        <div class="tag-suggestions" style="
          position: absolute;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          width: calc(100% - 32px);
          max-height: 120px;
          overflow-y: auto;
          z-index: 100;
          left: 16px;
          top: 100%;
          margin-top: 4px;
          padding: 4px 0;
        ">
          ${suggestedTags.map(tag => html`
            <div 
              key=${tag}
              onClick=${() => {
                const index = query.lastIndexOf('#');
                const newQuery = query.slice(0, index) + '#' + tag + ' ';
                setQuery(newQuery);
                setTimeout(() => document.getElementById('kairo-search')?.focus(), 50);
              }}
              style="
                padding: 6px 12px;
                font-size: 11px;
                color: var(--text-primary);
                cursor: pointer;
              "
              class="suggestion-item"
              onMouseEnter=${e => e.target.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave=${e => e.target.style.background = 'transparent'}
            >
              #${tag}
            </div>
          `)}
        </div>
      `}
    </div>

    <!-- Date Range & Platform Filters -->
    <div style="display: flex; gap: 8px; margin: 0 16px 8px 16px; align-items: center; flex-wrap: wrap;">
      <select 
        value=${activeDateFilter} 
        onChange=${e => setActiveDateFilter(e.target.value)}
        style="background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 4px 8px; font-size: 11px; font-weight: 500; cursor: pointer;"
        id="date-filter-select"
      >
        <option value="all">All Time</option>
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
      </select>

      ${platforms.length > 0 && platforms.map(p => html`
        <button
          key=${p}
          class="filter-chip ${activePlatform === p ? 'active' : ''}"
          onClick=${() => setActivePlatform(activePlatform === p ? null : p)}
          style="padding: 4px 8px; font-size: 11px;"
        >${platformName(p)}</button>
      `)}
    </div>

    <!-- Folder Filters -->
    ${folders.length > 0 && html`
      <div class="filters" style="padding-top: 0; display: block; padding-left: 16px; padding-right: 16px; margin-bottom: 8px;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px;">Folders:</div>
        <div style="margin-bottom: 6px;">
          <input 
            type="text" 
            placeholder="Search folders..." 
            value=${folderQuery}
            onInput=${e => setFolderQuery(e.target.value)}
            style="
              width: 100%;
              background: var(--bg-input);
              color: var(--text-primary);
              border: 1px solid var(--border-subtle);
              border-radius: var(--radius-sm);
              padding: 4px 8px;
              font-size: 11px;
              box-sizing: border-box;
            "
          />
        </div>
        ${renderFolderNode(buildFolderTree(folders.filter(f => f.toLowerCase().includes(folderQuery.toLowerCase()))))}
      </div>
    `}

    <!-- Stats Bar -->
    <div class="stats-bar">
      <span>${getCapsulesCountText()}${query || activePlatform || activeFolder ? t('foundSuffix', loc) : ''}</span>
      ${capsules.length > 0 && html`<span>${capsules.length}${t('totalSuffix', loc)}</span>`}
    </div>

    <!-- Capsule List -->
    <div class="capsule-list" id="kairo-capsule-list">
      ${loading && html`
        <div class="empty-state">
          <div class="empty-icon">
            <svg class="kairo-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block; margin:0 auto;">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
          </div>
          <div class="empty-title">${t('loading', loc)}</div>
        </div>
      `}

      ${!loading && sorted.length === 0 && html`
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto;">
              <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
            </svg>
          </div>
          <div class="empty-title">${t('noCapsulesTitle', loc)}</div>
          <div class="empty-desc">
            ${t('noCapsulesDesc', loc)}
          </div>
        </div>
      `}

      ${!loading && sorted.map(c => html`
        <${CapsuleCard}
          key=${c.id}
          capsule=${c}
          locale=${loc}
          searchQuery=${query}
          notionEnabled=${settings.notionEnabled}
          onCopy=${handleCopy}
          onCopyRaw=${handleCopyRaw}
          onInject=${handleInject}
          onNotion=${handleNotionExport}
          onPin=${handlePin}
          onExportSingle=${handleExportSingle}
          onDelete=${() => setDeleteTarget(c.id)}
        />
      `)}
    </div>

    <!-- Delete Confirmation -->
    ${deleteTarget && html`
      <div class="confirm-overlay" onClick=${() => setDeleteTarget(null)}>
        <div class="confirm-dialog" onClick=${e => e.stopPropagation()}>
          <div class="confirm-title">${t('deleteConfirmTitle', loc)}</div>
          <div class="confirm-text">${t('deleteConfirmText', loc)}</div>
          <div class="confirm-actions">
            <button class="confirm-btn" onClick=${() => setDeleteTarget(null)}>${t('btnCancel', loc)}</button>
            <button class="confirm-btn danger" onClick=${() => handleDelete(deleteTarget)}>${t('btnDelete', loc)}</button>
          </div>
        </div>
      </div>
    `}

    <!-- Toast -->
    ${toastMsg && html`
      <div style="
        position: fixed;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        color: var(--text-primary);
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        font-size: 11px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        z-index: 2000;
        animation: fadeIn 0.2s ease;
      ">${toastMsg}</div>
    `}
  `;
}

function CapsuleCard({ capsule, locale, notionEnabled, searchQuery, onCopy, onCopyRaw, onInject, onNotion, onPin, onExportSingle, onDelete }) {
  const c = capsule;
  const summaryText = c.content?.summary || c.content?.rawSnippet || '';
  const [includeReasoning, setIncludeReasoning] = useState(false);

  const turnCount = c.content?.rawTurns?.length || 0;
  const wordCount = (() => {
    const text = c.content?.rawSnippet || c.content?.rawTurns?.map(t => t.text).join(' ') || '';
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  })();

  const turnsText = turnCount === 1 ? t('turnBadge', locale) : t('turnsBadge', locale, { count: turnCount });
  const wordsText = wordCount === 1 ? t('wordBadge', locale) : t('wordsBadge', locale, { count: wordCount });

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCopy(c, { includeReasoning });
    }
  };

  return html`
    <div class="capsule-card" id="capsule-${c.id?.slice(0, 8)}" tabindex="0" onKeyDown=${handleKeyDown}>
      <div class="card-header">
        <div class="card-title">${highlightMatch(c.title || t('untitledCapsule', locale), searchQuery)}</div>
        <button class="icon-btn pin-btn" onClick=${() => onPin(c)} title=${c.meta?.pinned ? 'Unpin' : 'Pin'} style="border:none; background:transparent; cursor:pointer; padding: 2px 6px;">
          <i class="fa-solid fa-thumb-tack" style="color: ${c.meta?.pinned ? 'var(--accent)' : 'var(--text-muted)'};"></i>
        </button>
      </div>

      <div class="card-meta">
        <span class="platform-badge ${c.source}">
          ${platformName(c.source)}
        </span>
        ${c.meta?.enriched && html`
          <span class="enriched-badge">${t('badgeEnriched', locale)}</span>
        `}
        <span class="card-date">${timeAgo(c.capturedAt, locale)}</span>
        <span class="card-date" style="margin-left: 8px;">• ${turnsText} • ${wordsText}</span>
      </div>

      ${c.meta?.reasoning && html`
        <div style="display: flex; align-items: center; gap: 6px; margin: 8px 0; font-size: 11px; color: var(--text-secondary);">
          <input 
            type="checkbox" 
            checked=${includeReasoning} 
            onChange=${e => setIncludeReasoning(e.target.checked)} 
            id="toggle-reasoning-${c.id}" 
            style="cursor: pointer;"
          />
          <label for="toggle-reasoning-${c.id}" style="cursor: pointer;">${locale === 'es' ? 'Incluir razonamiento' : 'Include thinking process'}</label>
        </div>
      `}

      ${summaryText && html`
        <div class="card-summary">${highlightMatch(truncate(summaryText, 140), searchQuery)}</div>
      `}

      ${c.meta?.tags?.length > 0 && html`
        <div class="card-tags">
          ${c.meta.tags.map(t => html`<span class="tag" key=${t}>${t}</span>`)}
        </div>
      `}

      <div class="card-actions">
        <button class="card-btn" onClick=${() => onCopy(c, { includeReasoning })} title=${t('copyBtn', locale)}>
          ${t('copyBtn', locale)}
        </button>
        <button class="card-btn inject" onClick=${() => onInject(c, { includeReasoning })} title=${t('injectBtn', locale)}>
          ${t('injectBtn', locale)}
        </button>
        ${notionEnabled && html`
          <button class="card-btn" style="background: rgba(108,71,255,0.06); border-color: rgba(108,71,255,0.15);" onClick=${() => onNotion(c.id)} title=${t('notionBtn', locale)}>
            ${t('notionBtn', locale)}
          </button>
        `}
        <button class="card-btn" onClick=${() => onCopyRaw(c)} title=${locale === 'es' ? 'Copiar transcripción' : 'Copy transcript'} style="padding: 4px 6px;">
          <i class="fa-solid fa-file-lines" style="color: rgb(147, 162, 187);"></i>
        </button>
        <button class="card-btn" onClick=${() => onExportSingle(c)} title="Download JSON" style="padding: 4px 6px;">
          <i class="fa-solid fa-download" style="color: rgb(147, 162, 187);"></i>
        </button>
        <button class="card-btn delete" onClick=${onDelete} title=${t('btnDelete', locale)}>
          <i class="fa-solid fa-trash" style="color: rgb(147, 162, 187);"></i>
        </button>
      </div>
    </div>
  `;
}

// ─── Mount ──────────────────────────────────────────────────────
render(html`<${Popup} />`, document.getElementById('root'));
