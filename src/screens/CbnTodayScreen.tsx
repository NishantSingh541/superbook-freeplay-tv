import React, { useEffect, useState } from "react";
import { View, Text, TouchableHighlight, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import LinearGradient from "react-native-linear-gradient";
import { CachedData, ProviderAuthHelper, Styles, Colors, Typography } from "../helpers";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { getProvider } from "../providers";
import type { ContentFile, TodayLesson } from "@churchapps/content-providers";

type Props = {
  navigateTo(page: string, data?: any): void;
  providerId: string;
  sidebarState: (state: boolean) => void;
  sidebarExpanded?: boolean;
};

const CATEGORY_PRESCHOOL = 1;
const CATEGORY_PRIMARY = 2;

const toMessageFile = (f: ContentFile) => ({
  id: f.id,
  name: f.title,
  url: f.url,
  fileType: f.mediaType,
  loop: f.loop,
  loopVideo: f.loopVideo,
  seconds: f.seconds,
  image: f.thumbnail
});

export const CbnTodayScreen = (props: Props) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [preschool, setPreschool] = useState<TodayLesson | null>(null);
  const [primary, setPrimary] = useState<TodayLesson | null>(null);
  const [error, setError] = useState(false);

  const playLesson = (lesson: TodayLesson) => {
    CachedData.messageFiles = lesson.files.map(toMessageFile);
    props.navigateTo("player", {
      providerId: props.providerId,
      providerStartIndex: 0,
      streaming: true,
      folderStack: []
    });
  };

  const loadToday = async () => {
    setLoading(true);
    setError(false);
    try {
      const provider = getProvider(props.providerId);
      if (!provider || !provider.getTodayLesson) {
        props.navigateTo("contentBrowser", { providerId: props.providerId, folderStack: [] });
        return;
      }
      const auth = await ProviderAuthHelper.refreshIfNeeded(props.providerId);
      const [pre, prim] = await Promise.all([
        provider.getTodayLesson(CATEGORY_PRESCHOOL, auth),
        provider.getTodayLesson(CATEGORY_PRIMARY, auth)
      ]);

      if (pre && !prim) { playLesson(pre); return; }
      if (prim && !pre) { playLesson(prim); return; }
      if (pre && prim) {
        setPreschool(pre);
        setPrimary(prim);
        setLoading(false);
        return;
      }
      // Nothing scheduled today for either category — fall back to normal browsing
      props.navigateTo("contentBrowser", { providerId: props.providerId, folderStack: [] });
    } catch (ex) {
      console.error("[CbnToday] Failed to load today's lessons:", ex);
      setError(true);
      setLoading(false);
    }
  };

  useEffect(() => { loadToday(); }, [props.providerId]);

  if (loading) {
    return (
      <View style={{ ...Styles.menuScreen, flex: 1 }}>
        <LinearGradient colors={["#1a0f17", "#160a14", "#100714"]} style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: Typography.bodyMedium, marginTop: DimensionHelper.hp("3%") }}>
            {t("cbnToday.loading", "Checking today's lessons...")}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ ...Styles.menuScreen, flex: 1 }}>
        <LinearGradient colors={["#1a0f17", "#160a14", "#100714"]} style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ ...Styles.whiteText, marginBottom: DimensionHelper.hp("2%") }}>
            {t("cbnToday.loadFailed", "Couldn't load today's lessons.")}
          </Text>
          <TouchableHighlight
            style={{ backgroundColor: Colors.primaryDark, paddingVertical: DimensionHelper.hp("1.5%"), paddingHorizontal: DimensionHelper.wp("3%"), borderRadius: 12 }}
            underlayColor={Colors.primary}
            onPress={loadToday}
            hasTVPreferredFocus={true}
          >
            <Text style={Styles.smallWhiteText}>{t("cbnToday.tryAgain", "Try Again")}</Text>
          </TouchableHighlight>
        </LinearGradient>
      </View>
    );
  }

  // Both categories scheduled today — let the leader pick which one plays
  const tileBase = {
    width: DimensionHelper.wp("28%"),
    height: DimensionHelper.hp("30%"),
    borderRadius: 16,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    marginHorizontal: DimensionHelper.wp("2%"),
    borderWidth: 2,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.surface
  };

  return (
    <View style={{ ...Styles.menuScreen, flex: 1 }}>
      <LinearGradient colors={["#1a0f17", "#160a14", "#100714"]} style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ ...Styles.H2, marginBottom: DimensionHelper.hp("4%") }}>
          {t("cbnToday.chooseCategory", "Which lesson today?")}
        </Text>
        <View style={{ flexDirection: "row" }}>
          <TouchableHighlight
            testID="cbn-today-preschool"
            style={tileBase}
            underlayColor={Colors.primary}
            onPress={() => preschool && playLesson(preschool)}
            hasTVPreferredFocus={true}
          >
            <View style={{ alignItems: "center" }}>
              <Text style={Styles.H3}>{t("cbnToday.preSchool", "Pre-School")}</Text>
              <Text style={{ ...Styles.smallerWhiteText, marginTop: 8, textAlign: "center" }}>{preschool?.lessonTitle}</Text>
            </View>
          </TouchableHighlight>
          <TouchableHighlight
            testID="cbn-today-primary"
            style={tileBase}
            underlayColor={Colors.primary}
            onPress={() => primary && playLesson(primary)}
          >
            <View style={{ alignItems: "center" }}>
              <Text style={Styles.H3}>{t("cbnToday.primarySchool", "Primary School")}</Text>
              <Text style={{ ...Styles.smallerWhiteText, marginTop: 8, textAlign: "center" }}>{primary?.lessonTitle}</Text>
            </View>
          </TouchableHighlight>
        </View>
      </LinearGradient>
    </View>
  );
};
