// popup/popup.js — Kairo Popup UI (Preact + htm)

import { h, render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { html } from 'htm/preact';
import { timeAgo, truncate, platformName } from '../shared/utils.js';
import { buildInjectionText } from '../shared/inject.js';

// ─── Main Popup Component ───────────────────────────────────────
function Popup() {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [capsules, setCapsules] = useState([]);
  const [query, setQuery] = useState('');
  const [activeFolder, setActiveFolder] = useState(null);
  const [activePlatform, setActivePlatform] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Load capsules on mount
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_CAPSULES' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Popup] GET_CAPSULES failed:', chrome.runtime.lastError.message);
        setLoading(false);
        return;
      }
      if (Array.isArray(response)) {
        setCapsules(response);
      }
      setLoading(false);
    });
  }, []);

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
    return matchQuery && matchFolder && matchPlatform;
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

  useEffect(() => {
    if (!deleteTarget) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDeleteTarget(null);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget]);

  // ─── Copy to clipboard ─────────────────────────────────────
  const handleCopy = useCallback(async (capsule) => {
    try {
      const text = capsule.content?.summary
        ? `${capsule.title || 'Untitled'}\n\n${capsule.content.summary}\n\nGoals: ${(capsule.content.goals || []).join(', ')}\nStack: ${(capsule.content.stack || []).join(', ')}`
        : capsule.content?.rawSnippet || '';
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    } catch (err) {
      console.error('[Kairo Popup] Copy failed:', err);
      showToast('Copy failed');
    }
  }, []);

  // ─── Inject into active tab ────────────────────────────────
  const handleInject = useCallback(async (capsule) => {
    try {
      const contextText = buildInjectionText(capsule);

      chrome.runtime.sendMessage({
        type: 'INJECT_CONTEXT',
        contextText,
      }, (res) => {
        if (chrome.runtime.lastError) {
          console.error('[Kairo Popup] INJECT_CONTEXT failed:', chrome.runtime.lastError.message);
          showToast('Injection failed');
          return;
        }
        if (res?.success) {
          showToast('Injected into chat!');
        } else {
          showToast('Injection failed');
        }
      });
    } catch (err) {
      console.error('[Kairo Popup] Inject failed:', err);
      showToast('Injection failed');
    }
  }, []);

  // ─── Delete capsule ────────────────────────────────────────
  const handleDelete = useCallback((id) => {
    chrome.runtime.sendMessage({ type: 'DELETE_CAPSULE', id }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[Kairo Popup] DELETE_CAPSULE failed:', chrome.runtime.lastError.message);
        showToast('Delete failed');
        setDeleteTarget(null);
        return;
      }
      if (res?.success) {
        setCapsules(prev => prev.filter(c => c.id !== id));
        showToast('Capsule deleted');
      }
      setDeleteTarget(null);
    });
  }, []);

  const toggleSelectMode = () => {
  setSelectMode(prev => !prev);
  setSelectedIds(new Set());
};

const toggleSelected = useCallback((id) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);

const selectAllVisible = () => {
  setSelectedIds(new Set(sorted.map(c => c.id)));
};

const clearSelection = () => setSelectedIds(new Set());

const handleBulkDelete = useCallback(() => {
  const ids = [...selectedIds];
  chrome.runtime.sendMessage({ type: 'DELETE_CAPSULES', ids }, (res) => {
    if (chrome.runtime.lastError) {
      console.error('[Kairo Popup] DELETE_CAPSULES failed:', chrome.runtime.lastError.message);
      showToast('Bulk delete failed');
      setBulkDeleteConfirm(false);
      return;
    }
    if (res?.success) {
      setCapsules(prev => prev.filter(c => !ids.includes(c.id)));
      showToast(`${ids.length} capsule${ids.length !== 1 ? 's' : ''} deleted`);
      setSelectedIds(new Set());
    } else {
      showToast('Bulk delete failed');
    }
    setBulkDeleteConfirm(false);
  });
}, [selectedIds]);

const handleBulkExport = useCallback(() => {
  const toExport = capsules.filter(c => selectedIds.has(c.id));
  const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kairo-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${toExport.length} capsule${toExport.length !== 1 ? 's' : ''}`);
}, [capsules, selectedIds]);

  // ─── Open options page ─────────────────────────────────────
  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

 // ─── Render ─────────────────────────────────────────────────
  return html`
    <!-- Header -->
    <div class="kairo-header">
      <h1 style="display: flex; align-items: center; gap: 8px;">
        <img src="../assets/brand-logo.png" style="width: 22px; height: 22px; object-fit: contain; filter: brightness(0) invert(1);" />
        Kairo
      </h1>
      <div class="header-actions">
        <button
          class="icon-btn"
          onClick=${openOptions}
          title="Settings"
          aria-label="Open Kairo settings"
          id="kairo-settings-btn"
        ><span aria-hidden="true">⚙</span></button>
        <button
          class="icon-btn"
          onClick=${toggleSelectMode}
          title=${selectMode ? 'Exit select mode' : 'Select capsules'}
          aria-label=${selectMode ? 'Exit select mode' : 'Select capsules'}
          aria-pressed=${selectMode}
          ><span aria-hidden="true">${selectMode ? '✕' : '☑'}</span>
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="search-container">
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
          placeholder="Search capsules…"
          value=${query}
          onInput=${e => setQuery(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') e.preventDefault(); }}
          id="kairo-search"
          aria-label="Search saved capsules"
        />
      </div>
    </div>

    <!-- Platform Filters -->
    ${platforms.length > 0 && html`
      <div class="filters">
        <button
          class="filter-chip ${!activePlatform ? 'active' : ''}"
          onClick=${() => setActivePlatform(null)}
          aria-pressed=${!activePlatform}
        >All</button>
        ${platforms.map(p => html`
          <button
            key=${p}
            class="filter-chip ${activePlatform === p ? 'active' : ''}"
            onClick=${() => setActivePlatform(activePlatform === p ? null : p)}
            aria-pressed=${activePlatform === p}
          >${platformName(p)}</button>
        `)}
      </div>
    `}

    <!-- Folder Filters -->
    ${folders.length > 0 && html`
      <div class="filters" style="padding-top: 0;">
        ${folders.map(f => html`
          <button
            key=${f}
            class="filter-chip ${activeFolder === f ? 'active' : ''}"
            onClick=${() => setActiveFolder(activeFolder === f ? null : f)}
            aria-pressed=${activeFolder === f}
          >Folder: ${f}</button>
        `)}
      </div>
    `}

    <!-- Stats Bar -->
    <div class="stats-bar" aria-live="polite">
      <span>${sorted.length} capsule${sorted.length !== 1 ? 's' : ''}${query || activePlatform || activeFolder ? ' found' : ''}</span>
      ${capsules.length > 0 && html`<span>${capsules.length} total</span>`}
    </div>

    <!-- Bulk Action Bar -->
    ${selectMode && html`
      <div class="bulk-action-bar">
        <button class="card-btn" onClick=${selectAllVisible}>Select all (${sorted.length})</button>
        <button class="card-btn" onClick=${clearSelection}>Clear</button>
        <span style="flex:1"></span>
        <button class="card-btn" disabled=${selectedIds.size === 0} onClick=${handleBulkExport}>Export (${selectedIds.size})</button>
        <button class="card-btn delete-solid" disabled=${selectedIds.size === 0} onClick=${() => setBulkDeleteConfirm(true)}>Delete (${selectedIds.size})</button>
      </div>
    `}

    <!-- Capsule List -->
    <div class="capsule-list" id="kairo-capsule-list" aria-busy=${loading}>
      ${loading && html`
        <div class="empty-state" role="status">
          <div class="empty-icon">
            <svg class="kairo-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="display:block; margin:0 auto;">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
          </div>
          <div class="empty-title">Loading</div>
        </div>
      `}

      ${!loading && sorted.length === 0 && html`
        <div class="empty-state" role="status">
          <div class="empty-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="display:block; margin:0 auto;">
              <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
            </svg>
          </div>
          <div class="empty-title">No capsules yet</div>
          <div class="empty-desc">
            Visit any AI chat and click the capture button to save context.
          </div>
        </div>
      `}

      ${!loading && sorted.map(c => html`
        <${CapsuleCard}
          key=${c.id}
          capsule=${c}
          onCopy=${handleCopy}
          onInject=${handleInject}
          onDelete=${() => setDeleteTarget(c.id)}
          selectMode=${selectMode}
          selected=${selectedIds.has(c.id)}
          onToggleSelect=${() => toggleSelected(c.id)}
        />
      `)}
    </div>

    <!-- Delete Confirmation -->
    ${deleteTarget && html`
      <div class="confirm-overlay" onClick=${() => setDeleteTarget(null)}>
        <div
          class="confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-desc"
          onClick=${e => e.stopPropagation()}
        >
          <div class="confirm-title" id="delete-dialog-title">Delete Capsule?</div>
          <div class="confirm-text" id="delete-dialog-desc">This action cannot be undone. The capsule will be permanently removed.</div>
          <div class="confirm-actions">
            <button class="confirm-btn" onClick=${() => setDeleteTarget(null)}>Cancel</button>
            <button class="confirm-btn danger" onClick=${() => handleDelete(deleteTarget)}>Delete</button>
          </div>
        </div>
      </div>
    `}

    <!-- Bulk Delete Confirmation -->
    ${bulkDeleteConfirm && html`
      <div class="confirm-overlay" onClick=${() => setBulkDeleteConfirm(false)}>
        <div class="confirm-dialog" role="dialog" aria-modal="true" onClick=${e => e.stopPropagation()}>
          <div class="confirm-title">Delete ${selectedIds.size} capsule${selectedIds.size !== 1 ? 's' : ''}?</div>
          <div class="confirm-text">This action cannot be undone.</div>
          <div class="confirm-actions">
            <button class="confirm-btn" onClick=${() => setBulkDeleteConfirm(false)}>Cancel</button>
            <button class="confirm-btn danger" onClick=${handleBulkDelete}>Delete</button>
          </div>
        </div>
      </div>
    `}

    <!-- Toast -->
    ${toastMsg && html`
      <div role="status" aria-live="polite" style="
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

// ─── Capsule Card Component ─────────────────────────────────────
function CapsuleCard({ capsule, onCopy, onInject, onDelete, selectMode, selected, onToggleSelect }) {
  const c = capsule;
  const summaryText = c.content?.summary || c.content?.rawSnippet || '';

  return html`
    <article class="capsule-card ${selected ? 'card-selected' : ''}" id="capsule-${c.id?.slice(0, 8)}">
      <div class="card-header">
        ${selectMode && html`
          <input
            type="checkbox"
            class="card-checkbox"
            checked=${selected}
            onChange=${onToggleSelect}
            aria-label=${`Select ${c.title || 'untitled capsule'}`}
          />
        `}
        <div class="card-title">${c.title || 'Untitled Capsule'}</div>
        ${c.meta?.pinned && html`<span class="card-pin">Pinned</span>`}
      </div>

      <div class="card-meta">
        <span class="platform-badge ${c.source}">
          ${platformName(c.source)}
        </span>
        ${c.meta?.enriched && html`
          <span class="enriched-badge">Enriched</span>
        `}
        <span class="card-date">${timeAgo(c.capturedAt)}</span>
      </div>

      ${summaryText && html`
        <div class="card-summary">${truncate(summaryText, 140)}</div>
      `}

      ${c.meta?.tags?.length > 0 && html`
        <div class="card-tags">
          ${c.meta.tags.map(t => html`<span class="tag" key=${t}>${t}</span>`)}
        </div>
      `}

      <div class="card-actions">
        <button class="card-btn" onClick=${() => onCopy(c)} title="Copy to clipboard" aria-label=${`Copy ${c.title || 'untitled capsule'} to clipboard`}>
          Copy
        </button>
        <button class="card-btn inject" onClick=${() => onInject(c)} title="Inject into chat" aria-label=${`Inject ${c.title || 'untitled capsule'} into the active chat`}>
          Inject
        </button>
        <button class="card-btn delete" onClick=${onDelete} title="Delete capsule" aria-label=${`Delete ${c.title || 'untitled capsule'}`}>
          <span aria-hidden="true">Delete</span>
        </button>
      </div>
    </article>
  `;
}

// ─── Mount ──────────────────────────────────────────────────────
render(html`<${Popup} />`, document.getElementById('root'));

