const branding = require("./branding.json");

const isTvBuild =
  process.env.EXPO_TV === "1" || process.env.EXPO_TV === "true";

const getTvSafePlugins = (plugins) =>
  plugins.map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== "expo-build-properties") {
      return plugin;
    }

    const options = { ...(plugin[1] || {}) };
    const iosOptions = { ...(options.ios || {}) };

    // `useFrameworks: "static"` causes RNFirebase non-modular-header failures on tvOS.
    delete iosOptions.useFrameworks;
    const existingExtraPods = Array.isArray(iosOptions.extraPods) ? iosOptions.extraPods : [];
    const hasGoogleUtilitiesModularHeaders = existingExtraPods.some(
      (pod) => pod?.name === "GoogleUtilities"
    );

    // FirebaseCoreInternal is a Swift pod and requires GoogleUtilities to be modular.
    if (!hasGoogleUtilitiesModularHeaders) {
      existingExtraPods.push({ name: "GoogleUtilities", modular_headers: true });
    }

    iosOptions.extraPods = existingExtraPods;

    if (Object.keys(iosOptions).length > 0) {
      options.ios = iosOptions;
    } else {
      delete options.ios;
    }

    return [plugin[0], options];
  });

const buildPlugins = () => [
  [
    "@react-native-tvos/config-tv",
    {
      androidTVRequired: true,
      androidTVBanner: "./assets/images/tv_banner.png",
      androidTVIcon: "./assets/images/tv_icon.png",
      appleTVImages: {
        icon: "./assets/images/icon-1280x768.png",
        iconSmall: "./assets/images/icon-400x240.png",
        iconSmall2x: "./assets/images/icon-800x480.png",
        topShelf: "./assets/images/icon-1920x720.png",
        topShelf2x: "./assets/images/icon-3840x1440.png",
        topShelfWide: "./assets/images/icon-2320x720.png",
        topShelfWide2x: "./assets/images/icon-4640x1440.png"
      }
    }
  ],
  [
    "@sentry/react-native/expo",
    {
      url: "https://sentry.io/",
      project: branding.sentry.project,
      organization: branding.sentry.organization
    }
  ],
  "@react-native-firebase/app",
  [
    "expo-build-properties",
    {
      ios: { useFrameworks: "static" }
    }
  ],
  "./plugins/withSoundAssets",
  "./plugins/withTVManifestFixes",
  "./plugins/withCbnNetworkSecurityConfig",
  "./plugins/withReleaseSigning"
];

module.exports = () => {
  const plugins = buildPlugins();

  const expo = {
    name: branding.appName,
    slug: branding.slug,
    version: branding.version,
    orientation: "default",
    icon: "./assets/images/icon.png",
    scheme: branding.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    plugins: isTvBuild ? getTvSafePlugins(plugins) : plugins,
    android: {
      package: branding.android.package,
      googleServicesFile: "./google-services.json",
      versionCode: branding.android.versionCode,
      permissions: [
        "android.permission.INTERNET",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE"
      ],
      edgeToEdgeEnabled: true,
      splash: {
        image: "./assets/images/splash.png",
        resizeMode: "contain",
        backgroundColor: "#000000"
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: false,
          data: [
            {
              scheme: branding.scheme,
              host: "provider",
              pathPrefix: "/callback"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    ios: {
      bundleIdentifier: branding.ios.bundleIdentifier,
      buildNumber: branding.ios.buildNumber,
      googleServicesFile: "./GoogleService-Info.plist",
      splash: {
        image: "./assets/images/splash.png",
        resizeMode: "contain",
        backgroundColor: "#000000"
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    extra: {
      eas: { projectId: branding.eas.projectId },
      branding
    },
    runtimeVersion: "1.2.0",
    updates: {
      // Disabled for release builds: this fork shares ChurchApps' original
      // EAS projectId/updatesUrl, so any update THEY publish would silently
      // overwrite all local customizations at every app launch, with zero
      // warning. Re-enable fully only after pointing branding.eas.updatesUrl
      // at our own EAS project.
      //
      // IMPORTANT: `enabled: false` also blocks Metro/dev-client bundle
      // loading at the native level (expo-updates intercepts bundle loading
      // regardless of BuildConfig.DEBUG), so it must stay `true` for local
      // development builds or the app will always load a stale embedded
      // bundle and never reach Metro. Safe either way during dev: no OTA
      // update can be pushed unless someone runs `eas update` against this
      // project, which we don't do.
      url: branding.eas.updatesUrl,
      enabled: process.env.EXPO_PUBLIC_DEV_CLIENT === "1" ? true : false,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 5000,
      requestHeaders: {
        "expo-channel-name": "production"
      }
    },
    owner: branding.owner
  };

  return { expo };
};
