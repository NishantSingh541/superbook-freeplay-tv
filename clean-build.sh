#!/bin/bash
set -e
cd ~/superbook-freeplay-tv
find node_modules -maxdepth 4 -type d -path "*/android/build" -exec rm -rf {} +
rm -rf android/app/build android/app/.cxx android/.gradle
rm -rf ~/.gradle/caches/build-cache-1
adb uninstall church.freeplay 2>/dev/null || true
cd android
./gradlew clean
cd ..
export SENTRY_DISABLE_AUTO_UPLOAD=true
export REACT_NATIVE_PACKAGER_HOSTNAME=localhost
npx expo run:android --variant release
