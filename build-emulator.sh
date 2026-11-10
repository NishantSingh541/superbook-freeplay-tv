#!/usr/bin/env bash
# Build the EMULATOR test app (x86 only), install it and open it.
set -euo pipefail
cd "$(dirname "$0")"
export SENTRY_DISABLE_AUTO_UPLOAD=true EXPO_TV=1 NODE_ENV=production

rm -rf android/app/build/generated/assets/createBundleReleaseJsAndAssets android/app/build/intermediates/assets
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86)

mkdir -p builds
cp android/app/build/outputs/apk/release/app-release.apk builds/superbook-play-emulator.apk
echo "Built: builds/superbook-play-emulator.apk ($(du -h builds/superbook-play-emulator.apk | cut -f1))"

adb install -r builds/superbook-play-emulator.apk
adb shell am start -n com.cbn.superbook.play/.MainActivity
