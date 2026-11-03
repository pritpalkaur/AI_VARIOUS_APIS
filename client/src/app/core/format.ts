/** ISO string (UTC) -> value for <input type="datetime-local"> in the user's local time. */
export function toLocalInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO-8601 UTC string for the API (null if invalid). */
export function fromLocalInputValue(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Flash message passed between pages via router navigation state; read once, then cleared. */
export function takeFlash(): string | null {
  const flash = (history.state as { flash?: string } | null)?.flash ?? null;
  if (flash) history.replaceState({ ...history.state, flash: null }, '');
  return flash;
}
