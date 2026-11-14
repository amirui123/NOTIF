/**
 * Tiny, fail-safe wrapper around localStorage.
 * Safari private mode / disabled storage throws on access, so every call is guarded.
 */
export const storage = {
  /** @param {string} key @returns {T|null} */
  read(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
    } catch {
      return fallback;
    }
  },

  /** @param {string} key @param {unknown} value */
  write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
