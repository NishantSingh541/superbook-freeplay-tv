import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableHighlight,
  BackHandler,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView
} from "react-native";
import { useTranslation } from "react-i18next";
import { Styles, CachedData, ProviderAuthHelper, Colors, Typography, CbnAutoDownload } from "../helpers";
import { SoundHelper } from "../helpers/SoundHelper";
import { DeviceAuthorizationResponse, DeviceFlowState, ContentProviderAuthData, DeviceFlowHelper } from "../interfaces";
import { DimensionHelper } from "../helpers/DimensionHelper";
import LinearGradient from "react-native-linear-gradient";
import { getProvider } from "../providers";
import QRCode from "react-native-qrcode-svg";
import { PairingCode } from "../components";

const deviceFlowHelper = new DeviceFlowHelper();

type Props = {
  navigateTo(page: string, data?: any): void;
  sidebarState(state: boolean): void;
  sidebarExpanded?: boolean;
  providerId: string;
};

export const ProviderDeviceAuthScreen = (props: Props) => {
  const { t } = useTranslation();
  const [flowState, setFlowState] = useState<DeviceFlowState>({ status: "loading" });
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollGenerationRef = useRef<number>(0);
  const slowDownCountRef = useRef<number>(0);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const provider = getProvider(props.providerId);
  const providerConfig = provider?.config;

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    ).start();
  };

  const fadeIn = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  };

  const initDeviceFlow = async () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollGenerationRef.current += 1;
    slowDownCountRef.current = 0;
    const currentGeneration = pollGenerationRef.current;

    setFlowState({ status: "loading" });

    try {
      if (!provider?.initiateDeviceFlow || !provider.pollDeviceFlowToken) {
        setFlowState({
          status: "error",
          error: t("providerDeviceAuth.providerNotFound")
        });
        return;
      }

      const deviceAuth = await provider.initiateDeviceFlow();

      if (!deviceAuth) {
        setFlowState({
          status: "error",
          error: t("providerDeviceAuth.initFailed")
        });
        return;
      }

      setFlowState({
        status: "awaiting_user",
        deviceAuth
      });

      fadeIn();
      startPulseAnimation();
      startPolling(deviceAuth, currentGeneration);
    } catch (error) {
      console.error("Device flow init error:", error);
      setFlowState({
        status: "error",
        error: t("providerDeviceAuth.unexpectedError")
      });
    }
  };

  const startPolling = (
    deviceAuth: DeviceAuthorizationResponse,
    generation: number
  ) => {
    const expiresAt = Date.now() + deviceAuth.expires_in * 1000;
    const baseInterval = deviceAuth.interval || 5;

    const poll = async () => {
      if (generation !== pollGenerationRef.current) return;

      if (Date.now() >= expiresAt) {
        setFlowState({
          status: "expired",
          error: t("providerDeviceAuth.codeExpired")
        });
        return;
      }

      setFlowState(prev => ({ ...prev, status: "polling" }));

      const result = await provider!.pollDeviceFlowToken!(deviceAuth.device_code);

      if (generation !== pollGenerationRef.current) return;

      if (result === null) {
        setFlowState({
          status: "error",
          error: t("providerDeviceAuth.authFailed")
        });
        return;
      }

      if ("error" in result) {
        if (result.shouldSlowDown) {
          slowDownCountRef.current += 1;
        }

        const delay = deviceFlowHelper.calculatePollDelay(
          baseInterval,
          slowDownCountRef.current
        );

        setFlowState(prev => ({
          ...prev,
          status: "awaiting_user",
          pollCount: (prev.pollCount || 0) + 1
        }));

        pollTimeoutRef.current = setTimeout(poll, delay);
        return;
      }

      const newAuth = result as ContentProviderAuthData;
      // Check identity BEFORE setAuth() overwrites the previously-stored
      // auth — clears any existing CBN downloads if this pairing belongs
      // to a genuinely different person/group than last time.
      if (props.providerId === "cbn") {
        await CbnAutoDownload.clearDownloadsIfIdentityChanged(newAuth);
      }
      await ProviderAuthHelper.setAuth(props.providerId, newAuth);
      await ProviderAuthHelper.setConnectionState(props.providerId, true);
      setFlowState({ status: "success" });
      SoundHelper.playChime();

      if (!CachedData.connectedProviders.includes(props.providerId)) {
        CachedData.connectedProviders.push(props.providerId);
      }
      CachedData.activeProvider = props.providerId;
      // Kick off an immediate background download check for providers with
      // their own auto-download job (e.g. CBN), rather than waiting for the
      // next periodic timer tick in App.tsx.
      CbnAutoDownload.run();

      // Approver may have bound this screen to a plan type — enables "Today's Plan"
      const planTypeId = (result as { planTypeId?: string }).planTypeId;
      if (planTypeId) {
        CachedData.providerId = props.providerId;
        CachedData.pairingData = { planTypeId };
        await CachedData.setAsyncStorage("providerId", props.providerId);
        await CachedData.setAsyncStorage("pairingData", CachedData.pairingData);
        provider?.setPairingData?.(CachedData.pairingData);
      }

      setTimeout(() => {
        if (planTypeId) props.navigateTo("planDownload");
        else props.navigateTo("contentBrowser", { providerId: props.providerId, folderStack: [] });
      }, 2000);
    };

    const initialDelay = deviceFlowHelper.calculatePollDelay(baseInterval, 0);
    pollTimeoutRef.current = setTimeout(poll, initialDelay);
  };

  const handleBack = () => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
    }
    props.sidebarState(true);
  };

  useEffect(() => {
    initDeviceFlow();

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });

    return () => {
      backHandler.remove();
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  if (flowState.status === "loading") {
    return (
      <View style={Styles.menuScreen} testID="provider-device-auth-loading">
        <LinearGradient
          colors={[Colors.background, Colors.surface, Colors.surfaceDark]}
          style={{
            flex: 1,
            width: "100%",
            alignItems: "center",
            justifyContent: "center"
          }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text
            style={{
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: DimensionHelper.wp("1.8%"),
              marginTop: DimensionHelper.hp("3%"),
              letterSpacing: 1
            }}>
            {t("providerDeviceAuth.initializing")}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  if (flowState.status === "error" || flowState.status === "expired") {
    return (
      <View style={Styles.menuScreen}>
        <LinearGradient
          colors={[Colors.background, Colors.surface, Colors.surfaceDark]}
          style={{
            flex: 1,
            width: "100%",
            alignItems: "center",
            justifyContent: "center"
          }}>
          <Text
            style={{
              color: Colors.error,
              fontSize: DimensionHelper.wp("2%"),
              marginBottom: DimensionHelper.hp("4%"),
              textAlign: "center",
              paddingHorizontal: DimensionHelper.wp("10%")
            }}>
            {flowState.error}
          </Text>
          <TouchableHighlight
            onPress={initDeviceFlow}
            underlayColor={Colors.pressedBackground}
            hasTVPreferredFocus={true}
            style={{
              backgroundColor: Colors.primary,
              paddingVertical: DimensionHelper.hp("2%"),
              paddingHorizontal: DimensionHelper.wp("5%"),
              borderRadius: 8
            }}>
            <Text
              style={{
                color: Colors.textPrimary,
                fontSize: DimensionHelper.wp("2%"),
                fontWeight: "600"
              }}>
              {t("providerDeviceAuth.tryAgain")}
            </Text>
          </TouchableHighlight>
        </LinearGradient>
      </View>
    );
  }

  if (flowState.status === "success") {
    return (
      <View style={Styles.menuScreen}>
        <LinearGradient
          colors={[Colors.background, Colors.surface, Colors.surfaceDark]}
          style={{
            flex: 1,
            width: "100%",
            alignItems: "center",
            justifyContent: "center"
          }}>
          <Text
            style={{
              color: Colors.success,
              fontSize: DimensionHelper.wp("3%"),
              fontWeight: "bold"
            }}>
            {t("providerDeviceAuth.connected")}
          </Text>
          <Text
            style={{
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: DimensionHelper.wp("1.6%"),
              marginTop: DimensionHelper.hp("2%")
            }}>
            {t("providerDeviceAuth.loadingContent")}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  const deviceAuth = flowState.deviceAuth!;
  const verificationUrl =
    deviceAuth.verification_uri_complete || deviceAuth.verification_uri;

  return (
    <View style={Styles.menuScreen} testID="provider-device-auth-root">
      <LinearGradient
        colors={[Colors.background, Colors.surface, Colors.backgroundDark]}
        style={{ flex: 1, width: "100%" }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: DimensionHelper.hp("2%"),
            paddingBottom: DimensionHelper.hp("2%")
          }}
          showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            alignItems: "center",
            opacity: fadeAnim
          }}>
          <Text
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontSize: DimensionHelper.wp("2.5%"),
              fontWeight: "600",
              marginBottom: DimensionHelper.hp("1%")
            }}>
            {t("providerDeviceAuth.connectTo", { name: providerConfig?.name || t("providerDeviceAuth.fallbackProvider") })}
          </Text>

          <Text
            style={{
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: DimensionHelper.wp("1.4%"),
              letterSpacing: 0.5,
              marginBottom: DimensionHelper.hp("0.5%"),
              textAlign: "center",
              paddingHorizontal: DimensionHelper.wp("10%")
            }}>
            {t("providerDeviceAuth.instructions")}{"\n"}
          </Text>
          <Pressable
            onPress={() => Linking.openURL(verificationUrl)}
            testID="provider-device-auth-url-link">
            <Text
              style={{
                color: Colors.primary,
                fontSize: DimensionHelper.wp("1.4%"),
                textDecorationLine: "underline",
                marginBottom: DimensionHelper.hp("0.3%")
              }}>
              {deviceAuth.verification_uri}
            </Text>
          </Pressable>
          <Text
            style={{
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: DimensionHelper.wp("1.4%"),
              letterSpacing: 0.5,
              marginBottom: DimensionHelper.hp("1%"),
              textAlign: "center",
              paddingHorizontal: DimensionHelper.wp("10%")
            }}>
            {t("providerDeviceAuth.instructionsLine2")}
          </Text>

          <View
            style={{
              backgroundColor: "#ffffff",
              padding: DimensionHelper.wp("0.8%"),
              borderRadius: 12,
              marginBottom: DimensionHelper.hp("1.5%")
            }}>
            <QRCode
              value={verificationUrl}
              size={DimensionHelper.wp("9%")}
              backgroundColor="#ffffff"
              color="#000000"
            />
          </View>

          <View style={{ alignItems: "center" }} testID="provider-device-auth-user-code" accessibilityLabel={deviceAuth.user_code}>
            <Text
              style={{
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: Typography.labelSmall,
                marginBottom: DimensionHelper.hp("1%")
              }}>
              {t("providerDeviceAuth.enterCode")}
            </Text>
            <PairingCode code={deviceAuth.user_code} />
          </View>

          <Animated.View
            style={{
              marginTop: DimensionHelper.hp("5%"),
              flexDirection: "row",
              alignItems: "center",
              opacity: pulseAnim
            }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: Colors.primary,
                marginRight: DimensionHelper.wp("1%")
              }}
            />
            <Text
              style={{
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: Typography.labelMedium,
                letterSpacing: 0.5
              }}>
              {t("providerDeviceAuth.waiting")}
            </Text>
          </Animated.View>

          <Text
            style={{
              color: "rgba(255, 255, 255, 0.5)",
              fontSize: Typography.labelMedium,
              marginTop: DimensionHelper.hp("0.5%"),
              letterSpacing: 0.3
            }}>
            {t("providerDeviceAuth.secondary")}
          </Text>

          <TouchableHighlight
            onPress={initDeviceFlow}
            underlayColor="rgba(255, 255, 255, 0.1)"
            hasTVPreferredFocus={false}
            style={{
              marginTop: DimensionHelper.hp("1%"),
              paddingVertical: DimensionHelper.hp("0.8%"),
              paddingHorizontal: DimensionHelper.wp("2.5%"),
              borderRadius: 6,
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.15)"
            }}>
            <Text
              style={{
                color: "rgba(255, 255, 255, 0.5)",
                fontSize: Typography.labelMedium,
                letterSpacing: 0.3
              }}>
              {t("providerDeviceAuth.regenerate")}
            </Text>
          </TouchableHighlight>

          <Text
            style={{
              color: "rgba(255, 255, 255, 0.3)",
              fontSize: Typography.labelSmall,
              marginTop: DimensionHelper.hp("0.8%")
            }}>
            {t("providerDeviceAuth.expiresIn", { minutes: Math.floor(deviceAuth.expires_in / 60) })}
          </Text>
        </Animated.View>
        </ScrollView>

        <View
          style={{
            marginTop: DimensionHelper.hp("1%"),
            alignItems: "center"
          }}>
          <TouchableHighlight
            testID="provider-device-auth-cancel"
            onPress={handleBack}
            underlayColor="rgba(255, 255, 255, 0.1)"
            hasTVPreferredFocus={false}
            style={{
              paddingVertical: DimensionHelper.hp("1%"),
              paddingHorizontal: DimensionHelper.wp("2%"),
              borderRadius: 4
            }}>
            <Text
              style={{
                color: "rgba(255, 255, 255, 0.35)",
                fontSize: DimensionHelper.wp("1.2%"),
                letterSpacing: 0.3
              }}>
              {t("providerDeviceAuth.cancel")}
            </Text>
          </TouchableHighlight>
        </View>
      </LinearGradient>
    </View>
  );
};
