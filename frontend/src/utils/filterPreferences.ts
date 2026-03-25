/** Read a persisted filter preference from localStorage. */
export function getFilterPref(key: string, defaultValue: boolean): boolean {
  const saved = localStorage.getItem(`pref_${key}`);
  return saved !== null ? (JSON.parse(saved) as boolean) : defaultValue;
}

/** Persist a filter preference to localStorage. */
export function saveFilterPref(key: string, value: boolean): void {
  localStorage.setItem(`pref_${key}`, JSON.stringify(value));
}
