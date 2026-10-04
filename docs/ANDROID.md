# Facsimile Android APK

The Android build uses Capacitor to package the Facsimile React workstation as
a native Android application.

## Architecture

The APK contains the UI and native networking bridge. The scanner engine and
live-data provider stack remain in the Python Facsimile API service so Android
and desktop use the same deterministic scanner implementation.

This avoids maintaining a second breakout engine in JavaScript and keeps
provider behavior consistent across platforms.

## Build

GitHub Actions builds a debug APK on the `feature/android-apk` branch.

The workflow:

1. installs Node 22
2. builds the React UI
3. generates the Capacitor Android project
4. installs Android SDK 36
5. builds `assembleDebug`
6. uploads `facsimile-debug.apk` as a workflow artifact

## Using a physical Android phone

The phone and the computer running Facsimile should be on the same trusted
local network.

On Windows:

```text
mobile-server.bat
```

This starts Facsimile on all local interfaces at port 8765.

Find your PC's LAN IPv4 address with:

```text
ipconfig
```

Then open **Settings** in the Android app and enter, for example:

```text
http://192.168.1.50:8765
```

Tap **Test Connection**. When the health check succeeds, live scans use that
server.

Do not expose port 8765 directly to the public internet. For remote use, deploy
the API behind HTTPS and authentication.

## Android emulator

The default Android API URL is:

```text
http://10.0.2.2:8765
```

Android emulators map `10.0.2.2` to the host computer.

## Release signing

The CI workflow currently produces an installable debug APK for testing.
A Play Store build should use a release keystore stored in GitHub Actions
secrets and produce a signed AAB/APK.
