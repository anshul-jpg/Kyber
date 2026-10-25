import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kyber.companion',
  appName: 'KYBER',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  backgroundColor: '#181818',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#007acc',
    },
  },
};

export default config;
