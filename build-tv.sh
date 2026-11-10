#!/usr/bin/env bash
# Build the REAL TV app (ARM only):
#   - .aab  -> upload to Google Play
#   - .apk  -> install directly on a real Android TV for testing
set -euo pipefail
cd "$(dirname "$0")"
export SENTRY_DISABLE_AUTO_UPLOAD=true EXPO_TV=1 NODE_ENV=production
ARCHS="armeabi-v7a,arm64-v8a"

rm -rf android/app/build/generated/assets/createBundleReleaseJsAndAssets android/app/build/intermediates/assets
(cd android && ./gradlew bundleRelease assembleRelease -PreactNativeArchitectures=$ARCHS)

mkdir -p builds
cp android/app/build/outputs/bundle/release/app-release.aab builds/superbook-play-tv.aab
cp android/app/build/outputs/apk/release/app-release.apk  builds/superbook-play-tv.apk
echo "Built: builds/superbook-play-tv.aab ($(du -h builds/superbook-play-tv.aab | cut -f1))  -> Google Play"
echo "Built: builds/superbook-play-tv.apk ($(du -h builds/superbook-play-tv.apk | cut -f1))  -> real TV sideload"
