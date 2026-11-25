import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aklatone.app",
  appName: "AklatOne",
  webDir: "dist",
  // One phone app, two native projects in frontend/mobile-capacitor: android/ (APK / Play Store) and ios/ (Xcode on a Mac).
  // The same code runs in both; Capacitor.getPlatform() tells which OS the app is running on.
  android: {
    path: "mobile-capacitor/android",
    allowMixedContent: true,
  },
  ios: {
    path: "mobile-capacitor/ios",
  },
};

export default config;