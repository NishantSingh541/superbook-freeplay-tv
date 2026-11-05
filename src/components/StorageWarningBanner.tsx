import React, { useCallback, useEffect, useState } from "react";
import { AppState, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTranslation } from "react-i18next";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { CachedData } from "../helpers/CachedData";
import { StorageManager, STORAGE_ALERT_RATIO, STORAGE_CRITICAL_RATIO } from "../helpers/StorageManager";

const CHECK_INTERVAL_MS = 60 * 1000;
const DISMISS_DURATION_MS = 60 * 1000; // hidden for 1 hour after the user presses X
const DISMISS_KEY = "storage_banner_dismissed";
const GB = 1024 * 1024 * 1024;
const toGb = (bytes: number) => (bytes / GB).toFixed(1);

const ORANGE = "#f97316";
const RED = "#ef4444";

type Level = "orange" | "red" | "full";
// Higher number = more serious. Used so a WORSE level shows straight away
// even during the 1-hour snooze (e.g. orange was dismissed, storage then hits 80%).
const SEVERITY: Record<Level, number> = { orange: 1, red: 2, full: 3 };

type BannerState =
  | { kind: "none" }
  | { kind: Level; percent: number; usedGb: string; totalGb: string };

type Dismissed = { until: number; level: Level };

/**
 * Storage alert shown on every page (rendered once by NavWrapper).
 * - below 65% used: nothing shown
 * - 65% - 79% used: orange alert
 * - 80%+ used: red alert (new auto-downloads are paused)
 * - "full": red alert saying a lesson couldn't be downloaded (no room).
 * Nothing is ever auto-deleted; the user decides what to remove.
 *
 * The X button hides the banner for 1 hour (remembered even if the app is
 * restarted). After the hour it reappears with whatever level applies then.
 * If storage gets worse during the hour, it reappears immediately.
 */
export const StorageWarningBanner = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<BannerState>({ kind: "none" });
  const [closeFocused, setCloseFocused] = useState(false);

  const check = useCallback(async () => {
    const space = await StorageManager.getDeviceSpace();
    if (!space) { setState({ kind: "none" }); return; }

    let level: Level | null = null;
    if (CachedData.lowStorageNotice) level = "full";
    else if (space.usedRatio >= STORAGE_CRITICAL_RATIO) level = "red";
    else if (space.usedRatio >= STORAGE_ALERT_RATIO) level = "orange";
    if (!level) { setState({ kind: "none" }); return; }

    const dismissed: Dismissed | null = await CachedData.getAsyncStorage(DISMISS_KEY);
    const snoozed = !!dismissed
      && Date.now() < dismissed.until
      && SEVERITY[level] <= SEVERITY[dismissed.level];
    if (snoozed) { setState({ kind: "none" }); return; }

    setState({
      kind: level,
      percent: Math.round(space.usedRatio * 100),
      usedGb: toGb(space.usedBytes),
      totalGb: toGb(space.totalBytes)
    });
  }, []);

  const dismiss = useCallback(async () => {
    if (state.kind === "none") return;
    const record: Dismissed = { until: Date.now() + DISMISS_DURATION_MS, level: state.kind };
    await CachedData.setAsyncStorage(DISMISS_KEY, record);
    setCloseFocused(false);
    setState({ kind: "none" });
  }, [state]);

  useEffect(() => {
    check();
    const unsubscribe = StorageManager.subscribe(check);
    const timer = setInterval(check, CHECK_INTERVAL_MS); // also brings it back once the hour is up
    const appStateSub = AppState.addEventListener("change", s => { if (s === "active") check(); });
    return () => {
      unsubscribe();
      clearInterval(timer);
      appStateSub.remove();
    };
  }, [check]);

  if (state.kind === "none") return null;

  const vars = { percent: state.percent, used: state.usedGb, total: state.totalGb };
  const color = state.kind === "orange" ? ORANGE : RED;
  const icon = state.kind === "orange" ? "warning" : "error";
  const title = state.kind === "full"
    ? t("storage.fullTitle", "Storage is full ({{percent}}% · {{used}} of {{total}} GB used)", vars)
    : t("storage.usageTitle", "Storage is {{percent}}% full ({{used}} of {{total}} GB used)", vars);
  const message = state.kind === "full"
    ? t("storage.fullMessage", "A scheduled lesson couldn't be downloaded. Delete some downloads to make room.")
    : state.kind === "red"
      ? t("storage.redMessage", "Storage is almost full. New lessons won't download until you delete some downloads.")
      : t("storage.orangeMessage", "Storage is filling up. Consider deleting downloads you no longer need.");

  const closeSize = DimensionHelper.hp("6%");

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: DimensionHelper.wp("2%"),
        right: DimensionHelper.wp("2%"),
        bottom: DimensionHelper.hp("3%"),
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: DimensionHelper.hp("1.4%"),
        paddingHorizontal: DimensionHelper.wp("1.5%"),
        borderRadius: 12,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: "rgba(15, 20, 30, 0.95)",
        zIndex: 1000,
        elevation: 10
      }}>
      <Icon
        name={icon}
        size={DimensionHelper.hp("4.5%")}
        color={color}
        style={{ marginRight: DimensionHelper.wp("1.2%") }}
      />
      <View style={{ flex: 1 }} pointerEvents="none">
        <Text style={{ color: "#FFFFFF", fontSize: DimensionHelper.wp("1.4%"), fontWeight: "600" }}>
          {title}
        </Text>
        <Text style={{ color: "#cbd5e1", fontSize: DimensionHelper.wp("1.15%"), marginTop: 2 }}>
          {message}
        </Text>
      </View>

      {/* Close (X): reachable with the remote (D-pad down/right, then OK) or by touch/mouse. */}
      <TouchableOpacity
        testID="storage-banner-close"
        accessibilityRole="button"
        accessibilityLabel={t("storage.dismiss", "Hide storage alert for 1 hour")}
        activeOpacity={0.8}
        onPress={dismiss}
        onFocus={() => setCloseFocused(true)}
        onBlur={() => setCloseFocused(false)}
        style={{
          marginLeft: DimensionHelper.wp("1.2%"),
          width: closeSize,
          height: closeSize,
          borderRadius: closeSize / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: closeFocused ? "#FFFFFF" : "rgba(255,255,255,0.08)",
          borderWidth: 2,
          borderColor: closeFocused ? color : "transparent",
          transform: [{ scale: closeFocused ? 1.1 : 1 }]
        }}>
        <Icon
          name="close"
          size={DimensionHelper.hp("3.6%")}
          color={closeFocused ? "#0f141e" : "#FFFFFF"}
        />
      </TouchableOpacity>
    </View>
  );
};
