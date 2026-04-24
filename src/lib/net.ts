export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Timeout: ${label}`));
    }, ms);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

export function isLikelyNetworkOrTimeoutError(err: unknown) {
  const message =
    typeof err === "string"
      ? err
      : typeof err === "object" && err && "message" in err
        ? String((err as { message?: unknown }).message)
        : "";

  const msg = message.toLowerCase();

  if (msg.includes("timeout:")) return true;
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("networkerror")) return true;
  if (msg.includes("network request failed")) return true;
  if (msg.includes("fetch failed")) return true;
  if (msg.includes("load failed")) return true;

  // Alguns navegadores retornam erros genéricos durante perda de conexão.
  if (msg.includes("typeerror") && msg.includes("fetch")) return true;

  return false;
}
