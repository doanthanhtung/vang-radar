export type AdminCredentials = {
  username: string;
  password: string;
};

const STORAGE_KEY = "vangscore.admin.credentials";

export function loadAdminCredentials(): AdminCredentials | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminCredentials>;
    return typeof parsed.username === "string" && typeof parsed.password === "string"
      ? { username: parsed.username, password: parsed.password }
      : null;
  } catch {
    return null;
  }
}

export function saveAdminCredentials(credentials: AdminCredentials): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

export function clearAdminCredentials(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
