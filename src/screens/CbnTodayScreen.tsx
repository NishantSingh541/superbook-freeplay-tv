import React, { useEffect, useState } from "react";
import { View, Text, TouchableHighlight, ActivityIndicator, Image, BackHandler } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
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
  initialCategory?: number;
};

const CATEGORY_PRESCHOOL = 455; // WordPress taxonomy term ID: "Preschool"
const CATEGORY_PRIMARY = 454;   // WordPress taxonomy term ID: "K-6" (displayed as "Primary School")

// Shared card sizing — matches ContentBrowserScreen's folder/file cards so
// every grid in the app has a consistent, polished look.
const CARD_IMAGE_HEIGHT = DimensionHelper.hp("25%");
const CARD_BORDER_RADIUS = 12;

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
  const [pickerLesson, setPickerLesson] = useState<TodayLesson | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const focusStyle = (id: string) =>
    focusedId === id
      ? { borderWidth: 2, borderColor: Colors.primary, transform: [{ scale: 1.03 }] }
      : { borderWidth: 2, borderColor: "transparent" };

  const playLesson = (lesson: TodayLesson, startIndex: number = 0) => {
    CachedData.messageFiles = lesson.files.map(toMessageFile);
    props.navigateTo("player", {
      providerId: props.providerId,
      providerStartIndex: startIndex,
      streaming: true,
      folderStack: [],
      backToPage: "cbnToday",
      backToData: { providerId: props.providerId, initialCategory: lesson.category ?? undefined }
    });
  };

  const handleSelectLesson = (lesson: TodayLesson) => {
    if (lesson.files.length > 1) {
      setPickerLesson(lesson);
    } else {
      playLesson(lesson, 0);
    }
  };

  const handlePickerBack = () => {
    setPickerLesson(null);
    if (!(preschool && primary)) {
      props.navigateTo("contentBrowser", { providerId: props.providerId, folderStack: [] });
    }
  };

  useEffect(() => {
    if (!pickerLesson) return;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handlePickerBack();
      return true;
    });
    return () => backHandler.remove();
  }, [pickerLesson, preschool, primary]);

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

      if (pre && !prim) {
        setPreschool(pre);
        setLoading(false);
        handleSelectLesson(pre);
        return;
      }
      if (prim && !pre) {
        setPrimary(prim);
        setLoading(false);
        handleSelectLesson(prim);
        return;
      }
      if (pre && prim) {
        setPreschool(pre);
        setPrimary(prim);
        setLoading(false);
        if (props.initialCategory === pre.category) {
          handleSelectLesson(pre);
        } else if (props.initialCategory === prim.category) {
          handleSelectLesson(prim);
        }
        return;
      }
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

  // A lesson with multiple videos: show each one as a selectable card,
  // styled to match ContentBrowserScreen's file cards exactly.
  if (pickerLesson) {
    return (
      <View style={{ ...Styles.menuScreen, flex: 1 }}>
        <LinearGradient colors={["#1a0f17", "#160a14", "#100714"]} style={{ flex: 1, width: "100%", padding: DimensionHelper.wp("2%") }}>
          <Text style={{ ...Styles.H2, textAlign: "center", marginBottom: DimensionHelper.hp("3%") }}>
            {pickerLesson.lessonTitle}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
            {pickerLesson.files.map((file, index) => (
              <TouchableHighlight
                key={file.id}
                testID={`cbn-today-video-${index}${focusedId === file.id ? "-focused" : ""}`}
                style={{
                  width: DimensionHelper.wp("18%"),
                  marginHorizontal: DimensionHelper.wp("1%"),
                  marginBottom: DimensionHelper.hp("3%"),
                  padding: 10,
                  borderRadius: CARD_BORDER_RADIUS,
                  ...focusStyle(file.id)
                }}
                underlayColor={Colors.pressedBackground}
                onPress={() => playLesson(pickerLesson, index)}
                onFocus={() => setFocusedId(file.id)}
                onBlur={() => setFocusedId(prev => (prev === file.id ? null : prev))}
                hasTVPreferredFocus={index === 0}
              >
                <View style={{ width: "100%" }}>
                  <View style={{ position: "relative" }}>
                    {file.thumbnail ? (
                      <Image
                        style={{ height: CARD_IMAGE_HEIGHT, width: "100%", borderRadius: CARD_BORDER_RADIUS }}
                        resizeMode="contain"
                        source={{ uri: file.thumbnail }}
                      />
                    ) : (
                      <View
                        style={{
                          height: CARD_IMAGE_HEIGHT,
                          width: "100%",
                          borderRadius: CARD_BORDER_RADIUS,
                          backgroundColor: Colors.backgroundCard,
                          justifyContent: "center",
                          alignItems: "center"
                        }}>
                        <Icon name="play-circle-outline" size={DimensionHelper.wp("4%")} color="rgba(255,255,255,0.5)" />
                      </View>
                    )}
                    {file.thumbnail && (
                      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
                        <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 30, padding: 8 }}>
                          <Icon name="play-arrow" size={DimensionHelper.wp("3%")} color="#fff" />
                        </View>
                      </View>
                    )}
                  </View>
                  <Text
                    style={{ color: "#fff", fontSize: DimensionHelper.wp("1.2%"), marginTop: DimensionHelper.hp("1%"), textAlign: "center" }}
                    numberOfLines={2}>
                    {file.title}
                  </Text>
                </View>
              </TouchableHighlight>
            ))}
          </View>
        </LinearGradient>
      </View>
    );
  }

  // Both categories scheduled today — let the leader pick which one plays,
  // styled to match ContentBrowserScreen's folder cards.
  const categoryTile = (
    id: string,
    label: string,
    lessonTitle: string | undefined,
    onPress: () => void,
    autoFocus: boolean
  ) => (
    <TouchableHighlight
      testID={`cbn-today-${id}${focusedId === id ? "-focused" : ""}`}
      style={{
        width: DimensionHelper.wp("22%"),
        marginHorizontal: DimensionHelper.wp("2%"),
        padding: 10,
        borderRadius: CARD_BORDER_RADIUS,
        ...focusStyle(id)
      }}
      underlayColor={Colors.pressedBackground}
      onPress={onPress}
      onFocus={() => setFocusedId(id)}
      onBlur={() => setFocusedId(prev => (prev === id ? null : prev))}
      hasTVPreferredFocus={autoFocus}
    >
      <View style={{ width: "100%" }}>
        <View
          style={{
            height: CARD_IMAGE_HEIGHT,
            width: "100%",
            borderRadius: CARD_BORDER_RADIUS,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.borderSubtle
          }}>
          <Icon name="school" size={DimensionHelper.wp("8%")} color="rgba(255,255,255,0.4)" />
          <Text
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: DimensionHelper.wp("1.5%"),
              textAlign: "center",
              paddingHorizontal: 12,
              marginTop: DimensionHelper.hp("1.5%")
            }}
            numberOfLines={2}>
            {label}
          </Text>
        </View>
        <Text
          style={{ color: "#fff", fontSize: DimensionHelper.wp("1.2%"), marginTop: DimensionHelper.hp("1%"), textAlign: "center" }}
          numberOfLines={2}>
          {lessonTitle}
        </Text>
      </View>
    </TouchableHighlight>
  );

  return (
    <View style={{ ...Styles.menuScreen, flex: 1 }}>
      <LinearGradient colors={["#1a0f17", "#160a14", "#100714"]} style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ ...Styles.H2, marginBottom: DimensionHelper.hp("4%") }}>
          {t("cbnToday.chooseCategory", "Which lesson today?")}
        </Text>
        <View style={{ flexDirection: "row" }}>
          {categoryTile(
            "preschool",
            t("cbnToday.preSchool", "Pre-School"),
            preschool?.lessonTitle,
            () => preschool && handleSelectLesson(preschool),
            true
          )}
          {categoryTile(
            "primary",
            t("cbnToday.primarySchool", "Primary School"),
            primary?.lessonTitle,
            () => primary && handleSelectLesson(primary),
            false
          )}
        </View>
      </LinearGradient>
    </View>
  );
};
