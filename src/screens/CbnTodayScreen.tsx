import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableHighlight, ActivityIndicator, Image, BackHandler, ScrollView, AppState } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTranslation } from "react-i18next";
import LinearGradient from "react-native-linear-gradient";
import { CachedData, ProviderAuthHelper, Styles, Colors, Typography, CbnAutoDownload, TimeoutHelper } from "../helpers";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { getProvider } from "../providers";
import { MenuHeader } from "../components";
import type { ContentFile, TodayLesson } from "@churchapps/content-providers";

const K6_ROBOT_IMAGE = require("../images/k6-robot.png");
const PRESCHOOL_ROBOT_IMAGE = require("../images/preschool-robot.png");

// Formats today's date as e.g. "August 24, 2026", matching the client
// reference design's header date display.
const formatTodayDate = () => {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

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
    const backToData = { providerId: props.providerId, initialCategory: lesson.category ?? undefined };
    props.navigateTo("providerDownload", {
      providerId: props.providerId,
      coverImage: lesson.files[startIndex]?.thumbnail || lesson.lessonThumb || lesson.courseThumb,
      title: lesson.lessonTitle,
      startIndex,
      folderStack: [],
      backToPage: "cbnToday",
      backToData
    });
  };

  const handleSelectLesson = (lesson: TodayLesson) => {
    if (lesson.files.length > 1) {
      // Show immediately with whatever files getTodayLesson bundled, then
      // silently upgrade. The /today endpoint's own playlist data often
      // lacks per-video thumbnails (confirmed against the website, which
      // shows real images exist for these same videos) — getPlaylistByLessonId
      // reliably includes them, same as Browse and auto-download already use.
      setPickerLesson(lesson);
      (async () => {
        try {
          const provider = getProvider(props.providerId);
          if (!provider?.getPlaylistByLessonId) return;
          const auth = await ProviderAuthHelper.refreshIfNeeded(props.providerId);
          const enrichedFiles = await TimeoutHelper.withTimeout(
            provider.getPlaylistByLessonId(lesson.lessonId, auth),
            8000,
            "enriching lesson files with thumbnails"
          );
          if (enrichedFiles && enrichedFiles.length > 0) {
            setPickerLesson(prev => (prev && prev.lessonId === lesson.lessonId ? { ...prev, files: enrichedFiles } : prev));
          }
        } catch (err) {
          console.error("[CbnToday] Failed to enrich picker files with thumbnails:", err);
          // Keep showing the original files — a video without a thumbnail
          // is still playable, just less visually complete.
        }
      })();
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
      const [pre, prim] = await TimeoutHelper.withTimeout(
        Promise.all([
          provider.getTodayLesson(CATEGORY_PRESCHOOL, auth),
          provider.getTodayLesson(CATEGORY_PRIMARY, auth)
        ]),
        8000,
        "loading today's lessons"
      );

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
      console.error("[CbnToday] Failed to load today's lessons, retrying silently:", ex);
      // No error screen — a stalled connection after the device has been
      // idle for a while is common and usually resolves on the very next
      // attempt. Keep the loading state up and just quietly try again
      // rather than making the user tap a manual retry button.
      retryTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) loadToday();
      }, 3000);
    }
  };

  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    CachedData.preventSidebarExpand = true;
    loadToday().finally(() => {
      CachedData.preventSidebarExpand = false;
    });
    // Also check for any newly scheduled lessons right now, so a lesson
    // scheduled seconds ago starts downloading immediately rather than
    // waiting for the next periodic background check.
    CbnAutoDownload.run();
  }, [props.providerId]);

  // If the app has been sitting idle/backgrounded for a while, the
  // connection can go stale. Refresh proactively the moment it's brought
  // back to the foreground, rather than waiting for the user to tap in
  // and hit a doomed request against a dead connection.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", nextState => {
      if (nextState === "active") {
        console.log("[CbnToday] App resumed — refreshing today's lessons");
        loadToday();
      }
    });
    return () => subscription.remove();
  }, [props.providerId]);

  if (loading) {
    return (
      <View style={{ ...Styles.menuScreen, flex: 1 }}>
        <LinearGradient colors={[Colors.background, Colors.surface, Colors.surfaceDark]} style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
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
        <LinearGradient colors={[Colors.background, Colors.surface, Colors.surfaceDark]} style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
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
    const provider = getProvider(props.providerId);
    const categoryDisplayName = (category: number | null) => {
      if (category === CATEGORY_PRIMARY) return t("cbnToday.primaryCategory", "Primary School");
      if (category === CATEGORY_PRESCHOOL) return t("cbnToday.preschoolCategory", "Preschool");
      return "";
    };
    const breadcrumbs = [
      provider?.name || "CBN",
      categoryDisplayName(pickerLesson.category),
      pickerLesson.courseTitle,
      pickerLesson.lessonTitle
    ].filter(Boolean);

    return (
      <View style={{ ...Styles.menuScreen, flex: 1 }}>
        <MenuHeader
          headerText={pickerLesson.lessonTitle}
          badgeText={t("cbnToday.currentLesson", "Current Lesson")}
          dateText={formatTodayDate()}
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            paddingHorizontal: DimensionHelper.wp("2.5%"),
            paddingVertical: DimensionHelper.hp("1%"),
            backgroundColor: Colors.surfaceDark
          }}>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <View key={`${crumb}-${idx}`} style={{ flexDirection: "row", alignItems: "center" }}>
                {isLast ? (
                  <View
                    style={{
                      backgroundColor: Colors.surface,
                      borderRadius: 20,
                      paddingVertical: DimensionHelper.hp("0.6%"),
                      paddingHorizontal: DimensionHelper.wp("1.5%")
                    }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: Colors.textPrimary,
                        fontSize: Typography.labelLarge,
                        fontWeight: "600"
                      }}>
                      {crumb}
                    </Text>
                  </View>
                ) : (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: Colors.textSubtle,
                      fontSize: Typography.labelLarge,
                      fontWeight: "400"
                    }}>
                    {crumb}
                  </Text>
                )}
                {!isLast && (
                  <Text
                    style={{
                      color: Colors.textDimmed,
                      fontSize: Typography.labelLarge,
                      marginHorizontal: DimensionHelper.wp("0.6%")
                    }}>
                    ›
                  </Text>
                )}
              </View>
            );
          })}
          <View style={{ flex: 1 }} />
          {pickerLesson.lessonNumber && (
            <View
              style={{
                backgroundColor: Colors.primary,
                borderRadius: 20,
                paddingVertical: DimensionHelper.hp("0.6%"),
                paddingHorizontal: DimensionHelper.wp("1.5%")
              }}>
              <Text
                numberOfLines={1}
                style={{
                  color: "#fff",
                  fontSize: Typography.labelLarge,
                  fontWeight: "700"
                }}>
                {t("cbnToday.lessonNumber", "Lesson {{number}}", { number: pickerLesson.lessonNumber })}
              </Text>
            </View>
          )}
        </View>
        <LinearGradient colors={[Colors.background, Colors.surface, Colors.surfaceDark]} style={{ flex: 1, width: "100%" }}>
          <ScrollView contentContainerStyle={{ padding: DimensionHelper.wp("2%") }}>
          {Array.from({ length: Math.ceil(pickerLesson.files.length / 3) }, (_, rowIndex) => (
            <View key={`row-${rowIndex}`} style={{ flexDirection: "row" }}>
            {pickerLesson.files.slice(rowIndex * 3, rowIndex * 3 + 3).map((file, colIndex) => {
              const index = rowIndex * 3 + colIndex;
              const isVideo = file.mediaType === "video";
              const isFocused = focusedId === file.id;
              return (
                <View
                  key={file.id}
                  style={{
                    flex: 1,
                    maxWidth: "31%",
                    marginHorizontal: DimensionHelper.wp("1%"),
                    marginBottom: DimensionHelper.hp("3%")
                  }}
                >
                  <TouchableHighlight
                    testID={`cbn-today-video-${index}${isFocused ? "-focused" : ""}`}
                    underlayColor={Colors.pressedBackground}
                    onPress={() => playLesson(pickerLesson, index)}
                    onFocus={() => setFocusedId(file.id)}
                    onBlur={() => setFocusedId(prev => (prev === file.id ? null : prev))}
                    hasTVPreferredFocus={index === 0}
                  >
                    <View style={{
                      width: "100%",
                      borderRadius: CARD_BORDER_RADIUS,
                      overflow: "hidden",
                      borderWidth: 4,
                      borderColor: isFocused ? Colors.primary : "transparent"
                    }}>
                      <View style={{ position: "relative" }}>
                        {file.thumbnail ? (
                          <Image
                            style={{ height: CARD_IMAGE_HEIGHT, width: "100%" }}
                            resizeMode="cover"
                            source={{ uri: file.thumbnail }}
                          />
                        ) : (
                          <View
                            style={{
                              height: CARD_IMAGE_HEIGHT,
                              width: "100%",
                              backgroundColor: Colors.backgroundCard,
                              justifyContent: "center",
                              alignItems: "center"
                            }}>
                            <Icon name="play-circle-outline" size={DimensionHelper.wp("4%")} color="rgba(255,255,255,0.5)" />
                          </View>
                        )}
                        {isVideo && file.thumbnail && (
                          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
                            <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 30, padding: 8 }}>
                              <Icon name="play-arrow" size={DimensionHelper.wp("3%")} color="#fff" />
                            </View>
                          </View>
                        )}
                      </View>
                      <Text
                        style={{ color: "#fff", fontSize: Typography.labelMedium, marginTop: DimensionHelper.hp("1%"), textAlign: "center" }}
                        numberOfLines={2}
                        ellipsizeMode="tail">
                        {file.title}
                      </Text>
                      <Text
                        style={{ color: "rgba(255,255,255,0.5)", fontSize: Typography.labelSmall, textAlign: "center" }}>
                        {isVideo ? t("contentBrowser.fileType.video") : t("contentBrowser.fileType.image")}
                      </Text>
                    </View>
                  </TouchableHighlight>
                </View>
              );
            })}
            </View>
          ))}
          </ScrollView>
        </LinearGradient>
      </View>
    );
  }

  // Both categories scheduled today — let the leader pick which one plays.
  // Shows the real course/lesson image plus episode + lesson details,
  // matching the scheduler's own card layout (e.g. "Ep. 111 — He is Risen" /
  // "Lesson 1: Jesus Forgives My Sins").
  // Static branding tile per client design: shows the curriculum's mascot
  // icon + a two-line brand/category label, instead of previewing today's
  // specific episode thumbnail/title. `lesson` is still used to gate
  // selection (guard against selecting an empty category) but no longer
  // drives what's displayed on the tile itself.
  const categoryTile = (
    id: string,
    brandName: string,
    curriculumLabel: string,
    robotImage: any,
    lesson: TodayLesson | null,
    onPress: () => void,
    autoFocus: boolean
  ) => {
    return (
      <TouchableHighlight
        testID={`cbn-today-${id}${focusedId === id ? "-focused" : ""}`}
        style={{
          width: DimensionHelper.wp("26%"),
          marginHorizontal: DimensionHelper.wp("2%")
        }}
        underlayColor="transparent"
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
              backgroundColor: Colors.backgroundCard,
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
              ...focusStyle(id)
            }}>
            <Image
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
              source={robotImage}
            />
          </View>
          <Text
            style={{ color: "#fff", fontSize: DimensionHelper.wp("1.3%"), marginTop: DimensionHelper.hp("1%"), textAlign: "center" }}
            numberOfLines={1}>
            {brandName}
          </Text>
          <Text
            style={{ color: "rgba(255,255,255,0.6)", fontSize: DimensionHelper.wp("1.1%"), marginTop: 2, textAlign: "center" }}
            numberOfLines={1}>
            {curriculumLabel}
          </Text>
          {!lesson && (
            <Text
              style={{ color: "rgba(255,255,255,0.4)", fontSize: DimensionHelper.wp("1%"), marginTop: DimensionHelper.hp("0.5%"), textAlign: "center", paddingHorizontal: DimensionHelper.wp("1%") }}>
              {t("cbnToday.notScheduled", "No adventures scheduled yet. Schedule a new lesson to plan your children's next adventure.")}
            </Text>
          )}
        </View>
      </TouchableHighlight>
    );
  };

  return (
    <View style={{ ...Styles.menuScreen, flex: 1 }}>
      <MenuHeader
        headerText={t("cbnToday.chooseCategory", "Which age group are you teaching?")}
        badgeText={t("cbnToday.currentLesson", "Current Lesson")}
        dateText={formatTodayDate()}
      />
      <LinearGradient colors={[Colors.background, Colors.surface, Colors.surfaceDark]} style={{ flex: 1, width: "100%", alignItems: "flex-start", justifyContent: "flex-start", paddingTop: DimensionHelper.hp("4%"), paddingLeft: DimensionHelper.wp("2%") }}>
        <View style={{ flexDirection: "row" }}>
          {categoryTile(
            "primary",
            t("cbnToday.k6Brand", "Superbook Academy"),
            t("cbnToday.k6Curriculum", "K-6 Curriculum"),
            K6_ROBOT_IMAGE,
            primary,
            () => primary && handleSelectLesson(primary),
            true
          )}
          {categoryTile(
            "preschool",
            t("cbnToday.preschoolBrand", "GizmoGo!"),
            t("cbnToday.preschoolCurriculum", "Preschool Curriculum"),
            PRESCHOOL_ROBOT_IMAGE,
            preschool,
            () => preschool && handleSelectLesson(preschool),
            false
          )}
        </View>
      </LinearGradient>
    </View>
  );
};
