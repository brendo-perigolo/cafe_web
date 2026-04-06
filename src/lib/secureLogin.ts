import CryptoJS from "crypto-js";
import { getDeviceToken } from "@/lib/device";

const LOGIN_BLOB_KEY = "safra:login_blob";
const LOGIN_BLOB_VERSION = 1;

export type EncryptedLoginState = {
  v: number;
  saved_at: string;
  email?: string;
  user_id?: string;
  selected_empresa_id?: string;
};

const getProjectRef = () => {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL);
    return url.hostname.split(".")[0] || "";
  } catch {
    return "";
  }
};

const getSecret = () => {
  // Note: this is meant to avoid casual inspection, not to protect against a compromised device.
  const deviceToken = getDeviceToken();
  const projectRef = getProjectRef();
  return `${projectRef}|${deviceToken}|safra:v${LOGIN_BLOB_VERSION}`;
};

export const saveEncryptedLoginState = (state: Omit<EncryptedLoginState, "v" | "saved_at">) => {
  try {
    const payload: EncryptedLoginState = {
      v: LOGIN_BLOB_VERSION,
      saved_at: new Date().toISOString(),
      ...state,
    };

    const plaintext = JSON.stringify(payload);
    const secret = getSecret();
    const encrypted = CryptoJS.AES.encrypt(plaintext, secret).toString();

    // Sempre persistimos em localStorage para suportar uso offline mesmo quando
    // o usuário não marcou "manter conectado".
    window.localStorage.setItem(LOGIN_BLOB_KEY, encrypted);
  } catch {
    // ignore
  }
};

export const loadEncryptedLoginState = (): EncryptedLoginState | null => {
  try {
    const encrypted = window.localStorage.getItem(LOGIN_BLOB_KEY);
    if (!encrypted) return null;

    const secret = getSecret();
    const bytes = CryptoJS.AES.decrypt(encrypted, secret);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);
    if (!plaintext) return null;

    const parsed = JSON.parse(plaintext) as EncryptedLoginState;
    if (!parsed || parsed.v !== LOGIN_BLOB_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearEncryptedLoginState = () => {
  try {
    window.localStorage.removeItem(LOGIN_BLOB_KEY);
  } catch {
    // ignore
  }
};
