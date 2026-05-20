import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.iranair.crewunified',
  appName: 'IRCrew',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    // Enable CapacitorHttp — required so window.fetch / our lib/upstreamClient
    // can call crew.iranair.com directly from the native shell without CORS
    // restrictions or an intermediate proxy server.
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
