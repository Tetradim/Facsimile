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
  },
};

export default config;
