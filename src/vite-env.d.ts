/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

declare module "virtual:pwa-register" {
	export function registerSW(options?: any): void;
}
