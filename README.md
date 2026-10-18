# My Computer Game 3D

A low-poly 3D room simulator inspired by 64-bit-era games. The Android app wraps the game in a fullscreen WebView and includes touch controls.

## Play in a browser
Open `index.html` from a local web server. The game imports Three.js from jsDelivr, so an internet connection is required.

## Android APK
The Android project is in `android/`. GitHub Actions automatically builds a debug APK when changes are pushed to `main`.

1. Open the repository's **Actions** tab.
2. Select the latest **Build Android APK** run.
3. Wait until it finishes successfully.
4. Under **Artifacts**, download `My-Computer-Game-Android-APK`.
5. Extract the ZIP and install `app-debug.apk` on your Android device.

The APK currently requires Android 6.0 (API 23) or newer and an internet connection to load the Three.js engine.

## Controls
- Use WASD or arrow keys on a computer.
- On phones, use the on-screen directional pad.
- Walk to the computer and press **E** or tap **Work at PC** to earn coins and experience.
- Buy upgrades and room decorations in the shop.
- Progress is saved locally on the device.

## Project checks
The `.github/workflows/build.yml` workflow checks JavaScript syntax and packages the web files. The `.github/workflows/build-apk.yml` workflow builds and uploads the Android APK.
