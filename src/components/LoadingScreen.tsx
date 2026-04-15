import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const LAST_OK_PATH_KEY = "safra:last_ok_path";

type LoadingScreenProps = {
  title?: string;
  detail?: string;
  timeoutMs?: number;
  fallbackPath?: string;
};

function readLastOkPath() {
  try {
    const stored = window.localStorage.getItem(LAST_OK_PATH_KEY);
    if (!stored) return null;
    if (!stored.startsWith("/")) return null;
    if (stored === "/auth") return null;
    return stored;
  } catch {
    return null;
  }
}

export function LoadingScreen({
  title = "Carregando...",
  detail,
  timeoutMs = 30_000,
  fallbackPath = "/dashboard",
}: LoadingScreenProps) {
  const navigate = useNavigate();
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutTriggered = useRef(false);

  const targetPath = useMemo(() => {
    const lastOk = readLastOkPath();
    const current = typeof window !== "undefined" ? window.location.pathname : "";
    if (lastOk && lastOk !== current) return lastOk;
    return fallbackPath;
  }, [fallbackPath]);

  useEffect(() => {
    const start = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    const timeout = window.setTimeout(() => {
      setTimedOut(true);

      if (!timeoutTriggered.current) {
        timeoutTriggered.current = true;
        // Try to return to the last known-good screen.
        navigate(targetPath, { replace: true });
      }
    }, timeoutMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [navigate, targetPath, timeoutMs]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-3 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <div>
          <p className="text-base font-semibold">{title}</p>
          {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">Tempo: {elapsedSec}s</p>
        </div>

        {timedOut ? (
          <div className="pt-2">
            <p className="text-sm text-destructive">
              Demorou demais para abrir. Voltando para a última tela disponível...
            </p>
            <div className="mt-3 flex justify-center">
              <Button variant="outline" onClick={() => navigate(targetPath, { replace: true })}>
                Voltar agora
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
