export const KEEP_CONNECTED_STORAGE_KEY = "safra:keep_connected";

export const getKeepConnectedPreference = () => {
  try {
    return localStorage.getItem(KEEP_CONNECTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setKeepConnectedPreference = (keepConnected: boolean) => {
  try {
    if (keepConnected) {
      localStorage.setItem(KEEP_CONNECTED_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(KEEP_CONNECTED_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
};

export const getPreferredStorage = (): Storage => {
  return getKeepConnectedPreference() ? localStorage : sessionStorage;
};

export const removeFromBothStorages = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }

  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const tryGetSupabaseProjectRef = () => {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL);
    const hostname = url.hostname;
    // Typically: <project-ref>.supabase.co
    return hostname.split(".")[0] || null;
  } catch {
    return null;
  }
};

export const clearSupabaseAuthFromLocalStorage = () => {
  // Best-effort cleanup so a previous “keep connected” session can’t be restored.
  try {
    const projectRef = tryGetSupabaseProjectRef();
    const prefix = projectRef ? `sb-${projectRef}-` : "sb-";

    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(prefix)) continue;
      // Covers: sb-<ref>-auth-token, code verifier, refresh token helpers, etc.
      keysToRemove.push(key);
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
};

export const dynamicSupabaseStorage: Storage = {
  get length() {
    return getPreferredStorage().length;
  },
  clear() {
    // Don’t clear localStorage blindly.
    getPreferredStorage().clear();
  },
  getItem(key: string) {
    return getPreferredStorage().getItem(key);
  },
  key(index: number) {
    return getPreferredStorage().key(index);
  },
  removeItem(key: string) {
    removeFromBothStorages(key);
  },
  setItem(key: string, value: string) {
    getPreferredStorage().setItem(key, value);
  },
};
