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
    CapacitorHttp: {
      enabled: true,
    },
    BackgroundRunner: {
      // Poll roster every hour. Android's WorkManager floor is ~15 min and
      // it will skip checks during Doze; "1 hour" is best-effort. Our
      // background script tries fetch() against crew.iranair.com — note
      // the runner's HTTP stack does NOT share our custom relaxed-TLS
      // OkHttp, so a successful poll depends on Android trusting the
      // upstream chain. The on-launch + on-resume foreground check is the
      // primary safety net.
      label: 'ir.iranair.crewunified.poll',
      src: 'background/poll.js',
      event: 'rosterPoll',
      repeat: true,
      interval: 60,            // minutes between runs
      autoStart: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#10B981',
      sound: 'default',
    },
  },
};

export default config;
