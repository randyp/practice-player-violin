const STORAGE_KEY = "practice-player-violin:prefs";

// Global, session-independent user preferences. Versioned so a future
// shape change can migrate old localStorage values instead of discarding them.
const DEFAULTS = {
  version: 1,
  countInMeasures: 1, // 0 = off, 1 or 2 measures of count-in
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
