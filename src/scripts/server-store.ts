export const STORAGE_KEY = 'ss14lab_server';

export function getServer(): string {
  return localStorage.getItem(STORAGE_KEY) || 'delta-v';
}

export function setServer(server: string): void {
  localStorage.setItem(STORAGE_KEY, server);
  window.dispatchEvent(new CustomEvent('ss14:server-change', { detail: { server } }));
}
