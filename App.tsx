import { useEffect } from "react";
import { Navigator } from "./src/navigation/Navigator";

import { EnvironmentHelper } from "./src/helpers/EnvironmentHelper";
import { LogBox } from "react-native";
import { ErrorHelper } from "./src/helpers/ErrorHelper";
import { PlanSync } from "./src/helpers/PlanSync";
import { CbnAutoDownload } from "./src/helpers/CbnAutoDownload";
import { MembershipHelper } from "./src/helpers/MembershipHelper";
import * as Updates from "expo-updates";
import * as Sentry from "@sentry/react-native";
import "./src/i18n";

const PLAN_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
// More frequent than PlanSync — CBN's schedule can change daily, and we
// want new upcoming entries picked up for background download promptly,
// not left waiting up to 6 hours.
const CBN_AUTO_DOWNLOAD_INTERVAL_MS = 10 * 60 * 1000;
// Random offset applied to every cycle (see scheduleCbnAutoDownload below).
// Devices that happen to launch around the same wall-clock time (e.g. a
// room full of TVs powered on together before a service) would otherwise
// stay synchronized on the same fixed cadence indefinitely, producing
// periodic request bursts against the backend instead of smooth, spread-out
// load. A random +/- offset each cycle decorrelates devices from each
// other over time without meaningfully changing how often any single
// device checks in.
const CBN_AUTO_DOWNLOAD_JITTER_MS = 90 * 1000;
// UC-D-03: how often to check whether a daily membership check is actually
// due (MembershipHelper.checkIfDue only makes a real network call once the
// last check is 24+ hours old — this interval just controls how often we
// glance at the clock, not how often we hit the backend).
const MEMBERSHIP_CHECK_POLL_MS = 60 * 60 * 1000; // hourly

Sentry.init({
  dsn: "https://ac7ef4e2f5095b74c8e5bc623750fefe@o4510432524107776.ingest.us.sentry.io/4510848267190272",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()]

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

EnvironmentHelper.init();

const checkForUpdates = async () => {
  // Disabled: this fork shares ChurchApps' original EAS projectId/updatesUrl,
  // so any update THEY publish would be silently pulled into this app too,
  // overwriting all local customizations at runtime with zero warning.
  // Re-enable only after pointing branding.json's eas.projectId/updatesUrl
  // at our own EAS project.
  return;
};

const App = () => {
  LogBox.ignoreLogs(["new NativeEventEmitter"]);

  useEffect(() => {
    ErrorHelper.init();
    checkForUpdates();
    const planSyncInterval = setInterval(() => { PlanSync.syncCurrentPlan(); }, PLAN_SYNC_INTERVAL_MS);

    // UC-D-03: load whatever status was last saved immediately (fast,
    // local-only), so Browse/download gating has a real answer from the
    // moment the app opens rather than defaulting to "active" until the
    // first network check completes. Then check hourly whether a fresh
    // check is actually due.
    MembershipHelper.loadCachedStatus();
    const membershipInterval = setInterval(() => { MembershipHelper.checkIfDue("cbn"); }, MEMBERSHIP_CHECK_POLL_MS);
    MembershipHelper.checkIfDue("cbn");

    // Self-rescheduling setTimeout instead of a fixed setInterval, so a
    // fresh random jitter is computed every cycle rather than the offset
    // being fixed once at mount time.
    let cbnAutoDownloadTimeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleCbnAutoDownload = () => {
      const jitter = Math.floor(Math.random() * (2 * CBN_AUTO_DOWNLOAD_JITTER_MS + 1)) - CBN_AUTO_DOWNLOAD_JITTER_MS;
      const delay = Math.max(0, CBN_AUTO_DOWNLOAD_INTERVAL_MS + jitter);
      cbnAutoDownloadTimeout = setTimeout(() => {
        CbnAutoDownload.run();
        scheduleCbnAutoDownload();
      }, delay);
    };
    scheduleCbnAutoDownload();

    // Also run once shortly after launch, rather than waiting a full interval.
    CbnAutoDownload.run();
    return () => {
      clearInterval(planSyncInterval);
      clearInterval(membershipInterval);
      if (cbnAutoDownloadTimeout) clearTimeout(cbnAutoDownloadTimeout);
    };
  }, []);

  return <Navigator />;

};
export default Sentry.wrap(App);
