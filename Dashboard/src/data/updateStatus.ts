export type UpdateCheckSource = "automatic" | "manual";

export type UpdateCheckSnapshot = {
  branch?: string | null;
  checkedAt?: string;
  checkSource?: UpdateCheckSource;
  checkState?: "current" | "dirty" | "fetch_failed" | "unsupported" | "update_available";
  current?: string | null;
  dirty?: boolean;
  fetchFailed?: boolean;
  latest?: string | null;
  message: string;
  remote?: string | null;
  restarting?: boolean;
  supported: boolean;
  updateAvailable?: boolean;
  upstream?: string | null;
  version?: string;
};

export const UPDATE_STATUS_EVENT = "horizon:update-status";
const UPDATE_STATUS_STORAGE_KEY = "horizon.update-status.v1";

export function loadUpdateCheckSnapshot(): UpdateCheckSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(UPDATE_STATUS_STORAGE_KEY) || "null") as UpdateCheckSnapshot | null;
    if (!value || typeof value !== "object" || typeof value.message !== "string" || typeof value.supported !== "boolean") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function saveUpdateCheckSnapshot(
  snapshot: UpdateCheckSnapshot,
  checkSource: UpdateCheckSource,
): UpdateCheckSnapshot {
  const value: UpdateCheckSnapshot = {
    ...snapshot,
    checkedAt: snapshot.checkedAt || new Date().toISOString(),
    checkSource,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(UPDATE_STATUS_STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent<UpdateCheckSnapshot>(UPDATE_STATUS_EVENT, { detail: value }));
  }
  return value;
}
