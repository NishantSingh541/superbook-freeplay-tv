import React, { useEffect, useState } from "react";
import { View, Text, TouchableHighlight, BackHandler, Image } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/MaterialIcons";
import { SvgUri } from "react-native-svg";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { Styles, CachedData, Colors, Typography, ProviderAuthHelper, ProviderSettingsHelper, StorageManager } from "../helpers";
import type { StorageUsage } from "../helpers/StorageManager";
import { MenuHeader } from "../components";
import { getProvider, FREEPLAY_PROVIDER_IDS, getAvailableProviders } from "../providers";
import { isLocked } from "../branding";
const authScreenFor = (p: ReturnType<typeof getProvider>) => {
  const authType = p?.authTypes?.[0];
  return authType === "oauth_pkce" ? "providerOAuth"
    : authType === "form_login" ? "providerFormLogin"
      : "providerDeviceAuth";
};
import { ProviderInfo } from "../interfaces";

type Props = {
  navigateTo(page: string, data?: any): void;
  sidebarState: (state: boolean) => void;
  sidebarExpanded?: boolean;
  providerId: string;
};

type RowKey = "library" | "autoDownload" | "disconnect";

export const ProviderSettingsScreen = (props: Props) => {
  const { t } = useTranslation();
  const provider = getProvider(props.providerId);
  const providerInfo: ProviderInfo | undefined = getAvailableProviders(FREEPLAY_PROVIDER_IDS).find(p => p.id === props.providerId);

  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState<boolean>(false);
  const [focusedRow, setFocusedRow] = useState<RowKey | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);

  const LOW_SPACE_ALERT_BYTES = 500 * 1024 * 1024; // matches StorageManager's own low-space threshold

  useEffect(() => {
    let active = true;
    StorageManager.getUsage().then(result => {
      if (active) setUsage(result);
    });
    return () => { active = false; };
  }, []);

  // Two independent auto-download mechanisms exist:
  //  - getCurrentPlan providers use a single global "current plan" slot
  //    (ProviderSettingsHelper.isAutoDownloadEnabled/setAutoDownloadEnabled).
  //  - getTodayLesson providers (e.g. CBN) have their own real per-provider
  //    flag + background job (CbnAutoDownload), since multiple such
  //    providers could coexist without a shared global slot.
  const usesPlanAutoDownload = !!provider?.getCurrentPlan;
  const usesCbnAutoDownload = !!provider?.getTodayLesson;
  const supportsAutoDownload = usesPlanAutoDownload || usesCbnAutoDownload;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      if (usesCbnAutoDownload) {
        setAutoDownloadEnabled(await ProviderSettingsHelper.isCbnAutoDownloadEnabled(props.providerId));
      } else {
        setAutoDownloadEnabled(ProviderSettingsHelper.isAutoDownloadEnabled(props.providerId));
      }
    })();
    const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => {
      active = false;
      backHandler.remove();
    };
  }, [props.providerId]);

  const handleBack = () => {
    props.navigateTo(isLocked ? "splash" : "providers");
    return true;
  };

  const toggleAutoDownload = async () => {
    const next = !autoDownloadEnabled;
    setAutoDownloadEnabled(next);
    if (usesCbnAutoDownload) {
      await ProviderSettingsHelper.setCbnAutoDownloadEnabled(props.providerId, next);
    } else {
      await ProviderSettingsHelper.setAutoDownloadEnabled(props.providerId, next);
    }
  };

  const handleDisconnect = async () => {
    await ProviderAuthHelper.clearAuth(props.providerId);
    await ProviderAuthHelper.setConnectionState(props.providerId, false);
    await ProviderSettingsHelper.clearSettings(props.providerId);
    if (CachedData.providerId === props.providerId) {
      await ProviderSettingsHelper.setAutoDownloadEnabled(props.providerId, false);
    }
    CachedData.connectedProviders = CachedData.connectedProviders.filter(id => id !== props.providerId);
    CachedData.clearFocusMemory(`contentBrowser_${props.providerId}`);
    if (CachedData.activeProvider === props.providerId) CachedData.activeProvider = null;
    // Route straight to this provider's auth screen instead of the picker,
    // since disconnecting means the user needs to re-authenticate right away.
    props.navigateTo(authScreenFor(provider), { providerId: props.providerId });
  };

  const renderAccountStatus = () => {
    const active = CachedData.membershipActive;
    return (
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        padding: DimensionHelper.wp("1.5%"),
        marginBottom: DimensionHelper.hp("1.5%"),
        borderRadius: 8,
        borderWidth: 2,
        borderColor: Colors.borderAccent,
        backgroundColor: Colors.surface
      }}>
        <View style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: active ? "#4caf50" : "#e53935",
          marginRight: DimensionHelper.wp("1%")
        }} />
        <Text style={{ color: Colors.textPrimary, fontSize: Typography.titleLarge }}>
          {t("providerSettings.accountStatus.label", "Account Status:")}
          {" "}
          {active ? t("providerSettings.accountStatus.active", "Active") : t("providerSettings.accountStatus.expired", "Expired")}
        </Text>
      </View>
    );
  };

  const renderLogo = () => {
    const logo = providerInfo?.logos?.dark;
    if (!logo) return null;
    const isSvg = logo.toLowerCase().endsWith(".svg");
    return (
      <View style={{ width: DimensionHelper.wp("12%"), height: DimensionHelper.hp("8%"), justifyContent: "center", alignItems: "center", marginRight: DimensionHelper.wp("2%") }}>
        {isSvg
          ? <SvgUri uri={logo} width="100%" height="100%" />
          : <Image source={{ uri: logo }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />}
      </View>
    );
  };

  const renderToggleRow = (key: RowKey, label: string, description: string, value: boolean, onPress: () => void, autoFocus = false) => {
    const isFocused = focusedRow === key;
    return (
      <TouchableHighlight
        testID={`provider-settings-${key}`}
        underlayColor={Colors.focusBackground}
        onPress={onPress}
        onFocus={() => setFocusedRow(key)}
        onBlur={() => setFocusedRow(prev => (prev === key ? null : prev))}
        hasTVPreferredFocus={autoFocus}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: DimensionHelper.wp("1.5%"),
          marginBottom: DimensionHelper.hp("1.5%"),
          borderRadius: 8,
          borderWidth: 2,
          borderColor: isFocused ? Colors.primary : Colors.borderAccent,
          backgroundColor: Colors.surface
        }}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Icon name={value ? "check-box" : "check-box-outline-blank"} size={DimensionHelper.wp("3%")} color={value ? Colors.primary : Colors.textSubtle} />
          <View style={{ flex: 1, marginLeft: DimensionHelper.wp("1.5%") }}>
            <Text style={{ color: Colors.textPrimary, fontSize: Typography.titleLarge }}>{label}</Text>
            <Text style={{ color: Colors.textSubtle, fontSize: Typography.bodySmall, marginTop: 2 }}>{description}</Text>
          </View>
        </View>
      </TouchableHighlight>
    );
  };

  const renderDisconnectRow = () => {
    const isFocused = focusedRow === "disconnect";
    return (
      <TouchableHighlight
        testID="provider-settings-disconnect"
        underlayColor={Colors.pressedBackground}
        onPress={handleDisconnect}
        onFocus={() => setFocusedRow("disconnect")}
        onBlur={() => setFocusedRow(prev => (prev === "disconnect" ? null : prev))}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          padding: DimensionHelper.wp("1.5%"),
          marginTop: DimensionHelper.hp("2%"),
          borderRadius: 8,
          borderWidth: 2,
          borderColor: isFocused ? Colors.primary : Colors.borderAccent,
          backgroundColor: Colors.backgroundCard
        }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Icon name="link-off" size={DimensionHelper.wp("2.5%")} color={Colors.error} />
          <Text style={{ color: Colors.error, fontSize: Typography.titleLarge, marginLeft: DimensionHelper.wp("1%") }}>{t("providerSettings.disconnect")}</Text>
        </View>
      </TouchableHighlight>
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return "0 GB";
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const renderStorageSection = () => {
    if (!usage || usage.totalBytes <= 0) return null;
    const downloadsPct = (usage.downloadsBytes / usage.totalBytes) * 100;
    const otherPct = (usage.otherBytes / usage.totalBytes) * 100;
    const freePct = Math.max(0, 100 - downloadsPct - otherPct);
    const isLow = usage.freeBytes < LOW_SPACE_ALERT_BYTES;

    const legendItem = (color: string, label: string, bytes: number) => (
      <View style={{ flexDirection: "row", alignItems: "center", marginRight: DimensionHelper.wp("2%"), marginTop: DimensionHelper.hp("0.8%") }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 6 }} />
        <Text style={{ color: Colors.textSubtle, fontSize: Typography.bodySmall }}>{label} · {formatBytes(bytes)}</Text>
      </View>
    );

    return (
      <View style={{
        padding: DimensionHelper.wp("1.5%"),
        marginBottom: DimensionHelper.hp("1.5%"),
        borderRadius: 8,
        borderWidth: 2,
        borderColor: Colors.borderAccent,
        backgroundColor: Colors.surface
      }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: DimensionHelper.hp("1%") }}>
          <Text style={{ color: Colors.textPrimary, fontSize: Typography.titleLarge }}>{t("providerSettings.storage.label", "Device Storage")}</Text>
          <Text style={{ color: Colors.textSubtle, fontSize: Typography.bodySmall }}>
            {formatBytes(usage.totalBytes - usage.freeBytes)} {t("providerSettings.storage.of", "of")} {formatBytes(usage.totalBytes)} {t("providerSettings.storage.used", "used")}
          </Text>
        </View>

        <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", backgroundColor: Colors.progressBackground }}>
          <View style={{ width: `${downloadsPct}%`, backgroundColor: Colors.primary }} />
          <View style={{ width: `${otherPct}%`, backgroundColor: Colors.textSubtle }} />
          <View style={{ width: `${freePct}%`, backgroundColor: "transparent" }} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {legendItem(Colors.primary, t("providerSettings.storage.downloads", "Downloaded Videos"), usage.downloadsBytes)}
          {legendItem(Colors.textSubtle, t("providerSettings.storage.other", "Other"), usage.otherBytes)}
          {legendItem(Colors.progressBackground, t("providerSettings.storage.free", "Free"), usage.freeBytes)}
        </View>

        {isLow && (
          <View style={{ marginTop: DimensionHelper.hp("1%"), padding: DimensionHelper.wp("1.2%"), borderRadius: 6, backgroundColor: "#5c1a1a" }}>
            <Text style={{ color: "#fff", fontSize: Typography.bodySmall }}>
              {t("providerSettings.storage.lowSpace", "Storage is running low. Delete some downloaded videos you no longer need to free up space.")}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const headerText = providerInfo?.name || t("providerSettings.header");

  return (
    <View style={{ ...Styles.menuScreen }} testID="provider-settings-root">
      <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: Colors.borderAccent, backgroundColor: Colors.surface, paddingHorizontal: DimensionHelper.wp("1%") }}>
        <View style={{ flex: 1 }}>
          <MenuHeader headerText={headerText} noBorder />
        </View>
      </View>
      <View style={{ ...Styles.menuWrapper, flex: 1, padding: DimensionHelper.wp("2%") }}>
        {renderStorageSection()}
        {renderAccountStatus()}
        {supportsAutoDownload && renderToggleRow(
          "autoDownload",
          t("providerSettings.autoDownload.label"),
          t("providerSettings.autoDownload.description"),
          autoDownloadEnabled,
          toggleAutoDownload
        )}
        {renderDisconnectRow()}
      </View>
    </View>
  );
};
