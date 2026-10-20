import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.antigravity.companion',
  appName: 'Antigravity Companion',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
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
