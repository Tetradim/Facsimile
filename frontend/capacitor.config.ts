/// <reference types="@capacitor/background-runner" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tetradim.facsimile",
  appName: "Facsimile",
  webDir: "dist",
  server: {
    androidScheme: "https",
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    BackgroundRunner: {
      label: "com.tetradim.facsimile.monitor",
      src: "runners/background.js",
      event: "monitorWatchlists",
      repeat: true,
      interval: 15,
      autoStart: true,
    },
  },
};

export default config;
