// shared/storage.js — chrome.storage.local wrapper for Capsule persistence
import { DEFAULT_SETTINGS, normalizeSettings } from './settings.js';

const STORAGE_KEY = 'kairo_capsules';
const SETTINGS_KEY = 'kairo_settings';

// chrome.storage has no transaction primitive, so overlapping read-modify-write
// cycles can lose updates (last write wins). Every mutating operation is chained
// through this module-level promise — a lightweight mutex — so each one runs to
// completion (including its write) before the next one reads.
let mutationChain = Promise.resolve();

function enqueueMutation(mutator) {
  const result = mutationChain.then(mutator, mutator);
  // Keep the chain alive whether or not an individual mutation rejects.
  mutationChain = result.then(
    () => {},
    () => {}
  );
  return result;
}

const SYNC_PINNED_KEY = 'kairo_pinned_capsules';

async function syncLocalPinnedToSync() {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    const capsules = res[STORAGE_KEY] || [];
    const pinned = capsules.filter(c => c.meta?.pinned);
    await chrome.storage.sync.set({ [SYNC_PINNED_KEY]: pinned });
  } catch (err) {
    console.error('[Kairo Sync] Failed to sync pinned capsules:', err);
  }
}

// Read-modify-write upsert. NOT locked on its own — callers must invoke it from
// within enqueueMutation so the read observes the previous mutation's write.
async function upsertCapsuleUnlocked(capsule) {
  const existing = await getCapsules();
  const idx = existing.findIndex(c => c.id === capsule.id);

  if (idx > -1) {
    existing[idx] = { ...existing[idx], ...capsule, updatedAt: Date.now() };
  } else {
    existing.unshift(capsule);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
  await syncLocalPinnedToSync();
}

/**
 * Save or upsert a capsule. Newest-first ordering.
 * Serialized through a module-level mutation queue so concurrent saves cannot
 * lose each other's writes (chrome.storage offers no transaction primitive).
 * @param {Object} capsule
 */
export async function saveCapsule(capsule) {
  return enqueueMutation(async () => {
    try {
      await upsertCapsuleUnlocked(capsule);
      return { success: true };
    } catch (err) {
      console.error('[Kairo] Storage write error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Retrieve all saved capsules.
 * @returns {Promise<Object[]>}
 */
export async function getCapsules() {
  try {
    const localRes = await chrome.storage.local.get(STORAGE_KEY);
    let localCaps = localRes[STORAGE_KEY] || [];

    const syncRes = await chrome.storage.sync.get(SYNC_PINNED_KEY);
    const syncedPinned = syncRes[SYNC_PINNED_KEY] || [];

    let modified = false;
    syncedPinned.forEach(syncCap => {
      const idx = localCaps.findIndex(c => c.id === syncCap.id);
      if (idx === -1) {
        if (syncCap.meta?.pinned) {
          localCaps.unshift(syncCap);
          modified = true;
        }
      } else {
        const localCap = localCaps[idx];
        if ((syncCap.updatedAt || 0) > (localCap.updatedAt || 0)) {
          localCaps[idx] = { ...localCap, ...syncCap };
          modified = true;
        }
      }
    });

    if (modified) {
      await chrome.storage.local.set({ [STORAGE_KEY]: localCaps });
    }

    return localCaps;
  } catch (err) {
    console.error('[Kairo] Storage read error:', err);
    return [];
  }
}

/**
 * Delete a capsule by its ID.
 * @param {string} id
 */
export async function deleteCapsule(id) {
  return enqueueMutation(async () => {
    try {
      const existing = await getCapsules();
      const filtered = existing.filter(c => c.id !== id);
      await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
      await syncLocalPinnedToSync();
      return { success: true };
    } catch (err) {
      console.error('[Kairo] Delete error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Partially update a capsule by its ID.
 * @param {string} id
 * @param {Object} updates - Fields to merge into the capsule
 */
export async function updateCapsule(id, updates) {
  return enqueueMutation(async () => {
    try {
      const capsules = await getCapsules();
      const capsule = capsules.find(c => c.id === id);
      if (!capsule) {
        return { success: false, error: 'Capsule not found' };
      }
      await upsertCapsuleUnlocked({ ...capsule, ...updates, updatedAt: Date.now() });
      return { success: true };
    } catch (err) {
      console.error('[Kairo] Update error:', err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Get extension settings.
 * @returns {Promise<Object>}
 */
export async function getSettings() {
  try {
    const res = await chrome.storage.sync.get(SETTINGS_KEY);
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) });
  } catch (err) {
    console.error('[Kairo] Settings read error:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings.
 * @param {Object} settings
 */
export async function saveSettings(settings) {
  try {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
    return { success: true };
  } catch (err) {
    console.error('[Kairo] Settings write error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Clear all capsule data. Danger zone.
 */
export async function clearAllCapsules() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
    return { success: true };
  } catch (err) {
    console.error('[Kairo] Clear error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Dedupes, cleans invalid structures, and optimizes storage.
 */
export async function compactDatabase() {
  return enqueueMutation(async () => {
    try {
      const localRes = await chrome.storage.local.get(STORAGE_KEY);
      let localCaps = localRes[STORAGE_KEY] || [];
      const initialCount = localCaps.length;

      // Filter invalid structures
      localCaps = localCaps.filter(c => {
        if (!c || typeof c !== 'object') return false;
        return typeof c.id === 'string' && typeof c.source === 'string' && typeof c.content === 'object';
      });

      // Deduplicate by ID
      const seen = new Set();
      localCaps = localCaps.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      await chrome.storage.local.set({ [STORAGE_KEY]: localCaps });
      await syncLocalPinnedToSync();

      const optimizedCount = localCaps.length;
      return { success: true, optimizedCount, removedCount: initialCount - optimizedCount };
    } catch (err) {
      console.error('[Kairo] Compaction error:', err);
      return { success: false, error: err.message };
    }
  });
}
