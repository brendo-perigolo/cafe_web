import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { Capacitor } from "@capacitor/core";

registerSW({
	immediate: true,
});

// Native (Capacitor) status bar color to match the app header.
void (async () => {
	if (!Capacitor.isNativePlatform()) return;
	try {
		const { StatusBar, Style } = await import("@capacitor/status-bar");
		await StatusBar.setOverlaysWebView({ overlay: false });
		await StatusBar.setBackgroundColor({ color: "#ffffff" });
		await StatusBar.setStyle({ style: Style.Dark });
	} catch {
		// Ignore if plugin isn't available in this environment.
	}
})();

createRoot(document.getElementById("root")!).render(<App />);
