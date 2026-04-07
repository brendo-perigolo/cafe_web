import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as { version?: string };
  const appVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";

  return {
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: [".trycloudflare.com"],
    https:
      process.env.VITE_DEV_HTTPS === "true" &&
      fs.existsSync(path.resolve(__dirname, "certs", "dev-key.pem")) &&
      fs.existsSync(path.resolve(__dirname, "certs", "dev-cert.pem"))
        ? {
            key: fs.readFileSync(path.resolve(__dirname, "certs", "dev-key.pem")),
            cert: fs.readFileSync(path.resolve(__dirname, "certs", "dev-cert.pem")),
          }
        : undefined,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: ["logo_minha_cafe.png"],
      manifest: {
        name: "Minha Colheita Café",
        short_name: "Minha Colheita",
        description: "Sistema de gestão de colheita de café com sincronização offline",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        display_override: ["fullscreen", "standalone"],
        background_color: "#F5F7FB",
        theme_color: "#F5F7FB",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  };
});
