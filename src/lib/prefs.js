const STORAGE_KEY = "practice-player-violin:prefs";

// Global, session-independent user preferences. Versioned so a future
// shape change can migrate old localStorage values instead of discarding them.
const DEFAULTS = {
  version: 1,
  countInMeasures: 1, // 0 = off, 1 or 2 measures of count-in
  lastSongId: null, // last-selected song's catalog id, or null (use the default first song)
  songKeys: {}, // per-song last-used key, keyed by catalog id (e.g. { "hot-cross-buns": "A4" })
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) { /* storage unavailable (private mode, quota) — prefs just won't persist */ }
}

// Merge a partial update into the stored prefs. Always re-reads storage so a
// long-lived page doesn't clobber prefs written since it last loaded them.
export function updatePrefs(patch) {
  savePrefs({ ...loadPrefs(), ...patch });
}

export function saveSongKey(songId, key) {
  const prefs = loadPrefs();
  savePrefs({ ...prefs, songKeys: { ...prefs.songKeys, [songId]: key } });
}
