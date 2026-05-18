import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ir.iranair.crewunified',
  appName: 'IRCrew',
  webDir: 'dist',
  server: {
    // Allow http://localhost dev backend access from the Android WebView while
    // the user hasn't switched to a production proxy URL yet.
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
