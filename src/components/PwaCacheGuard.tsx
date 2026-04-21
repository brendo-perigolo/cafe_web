import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { checkPwaCacheHealth, prefetchCriticalScreens, tryPersistStorage, tryUpdateServiceWorker } from "@/lib/pwaCache";

const WARNED_AT_KEY = "safra:pwa_cache_warned_at";
const WARN_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function shouldWarnAgain() {
	try {
		const last = window.localStorage.getItem(WARNED_AT_KEY);
		if (!last) return true;
		const lastMs = Number(last);
		if (!Number.isFinite(lastMs)) return true;
		return Date.now() - lastMs > WARN_COOLDOWN_MS;
	} catch {
		return true;
	}
}

function markWarnedNow() {
	try {
		window.localStorage.setItem(WARNED_AT_KEY, String(Date.now()));
	} catch {
		// ignore
	}
}

export function PwaCacheGuard() {
	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			const health = await checkPwaCacheHealth();
			if (cancelled) return;

			// When online, proactively download critical screens (route chunks).
			if (navigator.onLine) {
				// Best-effort: request persistent storage when supported (helps Android/Chrome avoid eviction).
				void tryPersistStorage();
				prefetchCriticalScreens();
			}

			if (health.ready) return;

			if (!shouldWarnAgain()) return;
			markWarnedNow();

			if (!health.supported) {
				toast({
					title: "Cache offline indisponível",
					description: "Seu navegador não suporta Service Worker/Cache Storage.",
				});
				return;
			}

			// Try a best-effort SW update when online.
			if (navigator.onLine) {
				await tryUpdateServiceWorker();
			}

			toast({
				title: "Verificação do cache offline",
				description:
					navigator.onLine
						? "Mantenha o app aberto alguns segundos com internet para garantir o modo offline antes de ir para a lavoura."
						: "Você está offline e o cache pode não estar completo. Conecte-se à internet e abra o app uma vez para preparar o modo offline.",
			});
		};

		// Small delay so the SW can take control after initial load.
		const timer = window.setTimeout(() => {
			run();
		}, 750);

		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, []);

	return null;
}
