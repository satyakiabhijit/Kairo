// popup/popup.js — Kairo Popup UI (Preact + htm)

import { h, render } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { html } from 'htm/preact';
import { timeAgo, truncate, platformName } from '../shared/utils.js';
import { buildInjectionText } from '../shared/inject.js';

// ─── Main Popup Component ───────────────────────────────────────
function Popup() {
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
      if (Array.isArray(response)) {
        setCapsules(response);
      }
      setLoading(false);
    });
  }, []);

  // Filter logic
  const filtered = capsules.filter(c => {
    const q = query.toLowerCase();
    const matchQuery = !q ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.content?.summary || '').toLowerCase().includes(q) ||
      (c.meta?.tags || []).some(t => t.toLowerCase().includes(q));
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
      if (res?.success) {
        setCapsules(prev => prev.filter(c => c.id !== id));
        showToast('Capsule deleted');
      }
      setDeleteTarget(null);
    });
  }, []);

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
        <button class="icon-btn" onClick=${openOptions} title="Settings" id="kairo-settings-btn">Settings</button>
      </div>
    </div>

    <!-- Search -->
    <div class="search-container">
      <div class="search-wrapper">
        <span class="search-icon">Search</span>
        <input
          class="search-input"
          type="text"
          placeholder="Search capsules…"
          value=${query}
          onInput=${e => setQuery(e.target.value)}
          id="kairo-search"
        />
      </div>
    </div>

    <!-- Platform Filters -->
    ${platforms.length > 0 && html`
      <div class="filters">
        <button
          class="filter-chip ${!activePlatform ? 'active' : ''}"
          onClick=${() => setActivePlatform(null)}
        >All</button>
        ${platforms.map(p => html`
          <button
            key=${p}
            class="filter-chip ${activePlatform === p ? 'active' : ''}"
            onClick=${() => setActivePlatform(activePlatform === p ? null : p)}
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
          >Folder: ${f}</button>
        `)}
      </div>
    `}

    <!-- Stats Bar -->
    <div class="stats-bar">
      <span>${sorted.length} capsule${sorted.length !== 1 ? 's' : ''}${query || activePlatform || activeFolder ? ' found' : ''}</span>
      ${capsules.length > 0 && html`<span>${capsules.length} total</span>`}
    </div>

    <!-- Capsule List -->
    <div class="capsule-list" id="kairo-capsule-list">
      ${loading && html`
        <div class="empty-state">
          <div class="empty-icon">Loading</div>
          <div class="empty-title">Loading</div>
        </div>
      `}

      ${!loading && sorted.length === 0 && html`
        <div class="empty-state">
          <div class="empty-icon">None</div>
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
        />
      `)}
    </div>

    <!-- Delete Confirmation -->
    ${deleteTarget && html`
      <div class="confirm-overlay" onClick=${() => setDeleteTarget(null)}>
        <div class="confirm-dialog" onClick=${e => e.stopPropagation()}>
          <div class="confirm-title">Delete Capsule?</div>
          <div class="confirm-text">This action cannot be undone. The capsule will be permanently removed.</div>
          <div class="confirm-actions">
            <button class="confirm-btn" onClick=${() => setDeleteTarget(null)}>Cancel</button>
            <button class="confirm-btn danger" onClick=${() => handleDelete(deleteTarget)}>Delete</button>
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

// ─── Capsule Card Component ─────────────────────────────────────
function CapsuleCard({ capsule, onCopy, onInject, onDelete }) {
  const c = capsule;
  const summaryText = c.content?.summary || c.content?.rawSnippet || '';

  return html`
    <div class="capsule-card" id="capsule-${c.id?.slice(0, 8)}">
      <div class="card-header">
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
        <button class="card-btn" onClick=${() => onCopy(c)} title="Copy to clipboard">
          Copy
        </button>
        <button class="card-btn inject" onClick=${() => onInject(c)} title="Inject into chat">
          Inject
        </button>
        <button class="card-btn delete" onClick=${onDelete} title="Delete capsule">
          Delete
        </button>
      </div>
    </div>
  `;
}

// ─── Mount ──────────────────────────────────────────────────────
render(html`<${Popup} />`, document.getElementById('root'));
