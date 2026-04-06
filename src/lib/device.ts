const DEVICE_TOKEN_KEY = "device_token";

export const safeRandomUUID = (): string => {
  const cryptoObj = globalThis.crypto as Crypto | undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);

    // RFC 4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }

  // Last-resort fallback (non-cryptographic)
  const rand = () => Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .slice(1);
  return `${rand()}${rand()}-${rand()}-${rand()}-${rand()}-${rand()}${rand()}${rand()}`;
};

export const getDeviceToken = () => {
  try {
    const existing = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (existing && existing.trim()) return existing;

    const token = safeRandomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    return token;
  } catch {
    return safeRandomUUID();
  }
};
