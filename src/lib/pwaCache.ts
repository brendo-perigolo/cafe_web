export type PwaCacheHealth = {
	supported: boolean;
	controlled: boolean;
	hasPrecache: boolean;
	indexCached: boolean;
	cacheNames: string[];
	ready: boolean;
	checkedAt: string;
};

function isSupported() {
	return typeof window !== "undefined" && "serviceWorker" in navigator && "caches" in window;
}

function looksLikePrecacheCacheName(name: string) {
	const lower = name.toLowerCase();
	return lower.startsWith("workbox-precache") || lower.includes("precache");
}

async function isIndexCached() {
	try {
		// Try the most common URLs Workbox/VitePWA precaches.
		const match1 = await caches.match("/", { ignoreSearch: true });
		if (match1) return true;

		const match2 = await caches.match("/index.html", { ignoreSearch: true });
		if (match2) return true;

		// Some deployments use explicit index at root without a slash normalization.
		const match3 = await caches.match("index.html", { ignoreSearch: true });
		return Boolean(match3);
	} catch {
		return false;
	}
}

export async function checkPwaCacheHealth(): Promise<PwaCacheHealth> {
	if (!isSupported()) {
		return {
			supported: false,
			controlled: false,
			hasPrecache: false,
			indexCached: false,
			cacheNames: [],
			ready: false,
			checkedAt: new Date().toISOString(),
		};
	}

	const cacheNames = await caches.keys();
	const controlled = Boolean(navigator.serviceWorker.controller);
	const hasPrecache = cacheNames.some(looksLikePrecacheCacheName);
	const indexCached = await isIndexCached();

	return {
		supported: true,
		controlled,
		hasPrecache,
		indexCached,
		cacheNames,
		ready: controlled && hasPrecache && indexCached,
		checkedAt: new Date().toISOString(),
	};
}

export async function tryUpdateServiceWorker(): Promise<boolean> {
	if (!isSupported()) return false;
	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (!registration) return false;
		await registration.update();
		return true;
	} catch {
		return false;
	}
}

export async function prefetchCriticalScreens() {
	// Prefetch route chunks so Dashboard/Panhadores/Lançamento are available offline.
	// This is a no-op in environments that don't support dynamic import prefetch.
	try {
		await Promise.all([
			import("@/pages/Auth"),
			import("@/pages/Dashboard"),
			import("@/pages/Panhadores"),
			import("@/pages/Lancamento"),
			import("@/pages/SelectEmpresa"),
		]);
	} catch {
		// Ignore: prefetch is best-effort
	}
}
