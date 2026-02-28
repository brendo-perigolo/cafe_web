import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.917ab50ed9334131a683416c76081127',
  appName: 'Minha Colheita Café',
  webDir: 'dist',
  server: {
    url: 'https://917ab50e-d933-4131-a683-416c76081127.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
