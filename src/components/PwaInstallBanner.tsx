import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type UserChoiceOutcome = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: UserChoiceOutcome; platform: string }>;
}

function getIsInstalled() {
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const isIosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return Boolean(isStandalone || isIosStandalone);
}

function getIsIos() {
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua);
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = "pwa_install_banner_dismissed_v1";

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    setInstalled(getIsInstalled());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const isIos = useMemo(() => getIsIos(), []);

  const shouldShow = !dismissed && !installed && (Boolean(deferredPrompt) || isIos);
  if (!shouldShow) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl">
      <Alert className="relative">
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Fechar"
          title="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        <AlertTitle>Instalar o app</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {isIos ? (
                <>No iPhone/iPad: toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</>
              ) : (
                <>
                  Instale para abrir como aplicativo (sem barra de endereço) e funcionar melhor offline. Depois, abra pelo
                  <b> ícone instalado</b> na tela inicial.
                </>
              )}
            </div>

            {deferredPrompt ? (
              <Button type="button" onClick={handleInstall} className="sm:shrink-0">
                Instalar
              </Button>
            ) : null}
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
