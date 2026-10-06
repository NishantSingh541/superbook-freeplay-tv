import React, { useEffect, useRef } from "react";
import { View, Text, TouchableHighlight, BackHandler, ImageBackground, Animated, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/MaterialIcons";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { CachedData, Styles, Colors, DownloadIndex, StorageManager } from "../helpers";
import { ThumbnailCache } from "../helpers/ThumbnailCache";
import { decodeEntities } from "../helpers/TextHelper";
import LinearGradient from "react-native-linear-gradient";
import { ContentFolder } from "../interfaces";
import { getProvider } from "../providers";
import { SvgUri } from "react-native-svg";

const CATEGORY_PRESCHOOL = 455;
const CATEGORY_PRIMARY = 454;

type Props = {
  navigateTo(page: string, data?: any): void;
  providerId: string;
  coverImage?: string;
  title?: string;
  description?: string;
  /** Lesson-level image to file the download under (falls back to the last folder in folderStack). */
  lessonImage?: string;
  /** School type (454 = K-6, 455 = Preschool); derived from folderStack when omitted. */
  category?: number | null;
  startIndex: number;
  folderStack?: ContentFolder[];
  /**
   * Explicit override for where Back should return to (from this screen,
   * or from playback after tapping Stream/the Start button). Takes
   * priority over the folderStack-based guess in handleBack — needed for
   * flows like CbnTodayScreen that have no real folder hierarchy.
   */
  backToPage?: string;
  backToData?: any;
};

// A video only counts as "downloaded" if its files are on disk AND this
// account's own download list includes them. The files folder is shared by
// every account on the device, so disk alone would let one account play
// another account's downloads.
const isDownloadedForThisAccount = async (files: any[]): Promise<boolean> => {
  if (!(await CachedData.allFilesCached(files))) return false;
  const mine = await DownloadIndex.getAll();
  const owned = new Set<string>();
  mine.forEach(e => e.messageFiles.forEach(f => {
    if (f.url) owned.add(decodeURIComponent(CachedData.getFilePath(f.url)));
  }));
  return files.every(f => !f.url || owned.has(decodeURIComponent(CachedData.getFilePath(f.url))));
};

export const ProviderDownloadScreen = (props: Props) => {
  const { t } = useTranslation();
  const [totalItems, setTotalItems] = React.useState(CachedData.totalCachableItems);
  const [cachedItems, setCachedItems] = React.useState(CachedData.cachedItems);
  const [currentFileProgress, setCurrentFileProgress] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [mode, setMode] = React.useState<"checking" | "choosing" | "downloading" | "ready">("checking");
  const [focusedBtn, setFocusedBtn] = React.useState<"download" | "stream">("download");
  const buttonFadeAnim = useRef(new Animated.Value(0)).current;
  const progressRef = useRef({ cached: 0, total: 0, file: 0 });
  const downloadActiveRef = useRef(false);

  const updateCounts = (cached: number, total: number): void => {
    setCachedItems(cached);
    setTotalItems(total);
    progressRef.current = { ...progressRef.current, cached, total };
    publishProgress();
  };

  const updateFileProgress = (progress: number): void => {
    setCurrentFileProgress(progress);
    progressRef.current = { ...progressRef.current, file: progress };
    publishProgress();
  };

  const downloadKey = React.useMemo(
    () => DownloadIndex.generateKey("provider", { providerId: props.providerId, title: props.title || "" }),
    [props.providerId, props.title]
  );

  const lessonImage = React.useMemo(() => {
    if (props.lessonImage) return props.lessonImage;
    const stack = props.folderStack || [];
    return (stack.length > 0 ? stack[stack.length - 1].thumbnail : undefined) || props.coverImage;
  }, [props.lessonImage, props.folderStack, props.coverImage]);

  const downloadCategory = (): number | null | undefined => {
    if (props.category !== undefined) return props.category;
    const root = (props.folderStack?.[0]?.title || "").toLowerCase();
    if (root.includes("preschool") || root.includes("pre-school")) return CATEGORY_PRESCHOOL;
    if (root.includes("k-6") || root.includes("k6") || root.includes("primary")) return CATEGORY_PRIMARY;
    return undefined;
  };

  // Publishes this download's progress to the registry the Downloads screen
  // (and a reopened copy of this screen) reads. Runs from callbacks that keep
  // firing even after this screen is left, so it only touches refs and the
  // static registry, never component state.
  const publishProgress = (): void => {
    if (!downloadActiveRef.current) return;
    const { cached, total, file } = progressRef.current;
    const percent = total > 0 ? Math.min(100, Math.round(((cached + file) / total) * 100)) : 0;
    CachedData.downloadingEntries[downloadKey] = {
      title: props.title || "",
      image: lessonImage,
      progress: percent,
      filesCached: cached,
      filesTotal: total
    };
  };

  const handleStart = () => {
    StorageManager.touchEntry(downloadKey);
    props.navigateTo("player", {
      providerId: props.providerId,
      providerStartIndex: props.startIndex,
      folderStack: props.folderStack,
      backToPage: props.backToPage,
      backToData: props.backToData
    });
  };

  const handleStream = () => {
    props.navigateTo("player", {
      providerId: props.providerId,
      providerStartIndex: props.startIndex,
      streaming: true,
      folderStack: props.folderStack,
      backToPage: props.backToPage,
      backToData: props.backToData
    });
  };

  const handleDownload = () => {
    setMode("downloading");
    if (CachedData.downloadingEntries[downloadKey]) return; // already running: just follow it
    startDownload();
  };

  const getContent = () => {
    if (mode === "checking") {
      return (
        <ActivityIndicator size="large" color={Colors.primary} />
      );
    }

    if (mode === "choosing") {
      const btnBase = { width: DimensionHelper.wp("18%"), height: DimensionHelper.hp("7%"), borderRadius: 12, justifyContent: "center" as const, alignItems: "center" as const, borderWidth: 2 };
      const focusedStyle = { backgroundColor: Colors.primaryDark, borderColor: Colors.primary };
      const unfocusedStyle = { backgroundColor: Colors.surface, borderColor: Colors.borderSubtle };
      return (<>
        <Text style={Styles.H2}>{decodeEntities(props.title) || t("providerDownload.fallbackTitle")}</Text>
        {props.description && (
          <Text style={{ ...Styles.smallerWhiteText, color: Colors.textLight }}>{props.description}</Text>
        )}
        {lowStorage && (
          <Text style={{ color: "#ff8a8a", fontSize: 13, marginTop: 4 }}>
            {t("providerDownload.lowStorage", "Not enough storage to download this right now.")}
          </Text>
        )}
        {!CachedData.membershipActive && (
          <Text style={{ color: "#ff8a8a", fontSize: 13, marginTop: 4 }}>
            {t("providerDownload.membershipLapsed", "Your membership has lapsed — new downloads aren't available. Streaming still works.")}
          </Text>
        )}
        <View style={{ flexDirection: "row", marginTop: DimensionHelper.hp("1%"), gap: DimensionHelper.wp("1%") }}>
          {CachedData.membershipActive && (
            <TouchableHighlight testID="pd-download-btn" style={{ ...btnBase, ...(focusedBtn === "download" ? focusedStyle : unfocusedStyle) }} underlayColor={Colors.primary} onPress={handleDownload} onFocus={() => setFocusedBtn("download")} hasTVPreferredFocus={true}>
              <Text style={Styles.smallWhiteText} numberOfLines={1}>{t("providerDownload.download")}</Text>
            </TouchableHighlight>
          )}
          <TouchableHighlight testID="pd-stream-btn" style={{ ...btnBase, ...(focusedBtn === "stream" ? focusedStyle : unfocusedStyle) }} underlayColor={Colors.primary} onPress={handleStream} onFocus={() => setFocusedBtn("stream")} hasTVPreferredFocus={!CachedData.membershipActive}>
            <Text style={Styles.smallWhiteText} numberOfLines={1}>{t("providerDownload.stream")}</Text>
          </TouchableHighlight>
        </View>
      </>);
    }

    if (mode === "ready") {
      return (<>
        <Text style={Styles.H2}>{decodeEntities(props.title) || t("providerDownload.fallbackTitle")}</Text>
        {props.description && (
          <Text style={{ ...Styles.smallerWhiteText, color: Colors.textLight }}>{props.description}</Text>
        )}
        <Animated.View style={{ opacity: buttonFadeAnim }}>
          <TouchableHighlight testID="pd-play-btn" style={{ backgroundColor: Colors.primaryDark, width: DimensionHelper.wp("18%"), height: DimensionHelper.hp("7%"), marginTop: DimensionHelper.hp("1%"), borderRadius: 12, justifyContent: "center", alignItems: "center", flexDirection: "row" }} underlayColor={Colors.primary} onPress={() => { handleStart(); }} hasTVPreferredFocus={true}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="play-arrow" size={DimensionHelper.wp("2.5%")} color="#fff" />
              <Text style={{ ...Styles.smallWhiteText, marginLeft: 4 }} numberOfLines={1}>{t("providerDownload.start")}</Text>
            </View>
          </TouchableHighlight>
        </Animated.View>
      </>);
    }

    // mode === "downloading"
    let progress = 0;
    if (totalItems > 0) {
      progress = ((cachedItems + currentFileProgress) / totalItems) * 100;
    }
    const buttonHeight = DimensionHelper.hp("6%");
    return (
      <>
        <Text style={Styles.H2}>{decodeEntities(props.title) || t("providerDownload.fallbackTitle")}</Text>
        {props.description && (
          <Text style={{ ...Styles.smallerWhiteText, color: Colors.textLight }}>{props.description}</Text>
        )}
        <View style={{ width: DimensionHelper.wp("35%"), height: buttonHeight, marginTop: DimensionHelper.hp("1%"), borderRadius: 5, overflow: "hidden", backgroundColor: Colors.progressBackground, position: "relative" }}>
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress}%`, backgroundColor: Colors.primaryDark, borderRadius: 5 }} />
          <TouchableHighlight style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }} underlayColor={"rgba(255,255,255,0.1)"}>
            <Text style={{ ...Styles.smallWhiteText }} numberOfLines={1}>{t("providerDownload.downloadingItem", { current: cachedItems + 1, total: totalItems })}</Text>
          </TouchableHighlight>
        </View>
      </>
    );
  };

  const [lowStorage, setLowStorage] = React.useState(false);

  const startDownload = async () => {
    const files = CachedData.messageFiles;
    if (files && files.length > 0) {
      if (!CachedData.membershipActive) {
        setMode("choosing");
        return;
      }
      downloadActiveRef.current = true;
      setReady(false);
      const hasSpace = await StorageManager.ensureFreeSpace([downloadKey]);
      if (!hasSpace) {
        downloadActiveRef.current = false;
        setLowStorage(true);
        setMode("choosing");
        return;
      }
      setLowStorage(false);
      progressRef.current = { cached: 0, total: files.length, file: 0 };
      publishProgress();
      const finish = (): void => {
        downloadActiveRef.current = false;
        delete CachedData.downloadingEntries[downloadKey];
      };
      CachedData.prefetch(files, updateCounts, updateFileProgress)
        .then(async () => {
          await DownloadIndex.addEntry({
            downloadKey,
            source: "provider",
            providerId: props.providerId,
            title: props.title,
            description: props.description,
            image: lessonImage,
            category: downloadCategory(),
            messageFiles: files,
            downloadedAt: Date.now()
          });
          finish();
          setReady(true);
          // Keep offline copies of the thumbnails (in the background) so the
          // Downloads cards still show images with no internet.
          DownloadIndex.getAll().then(all => {
            const saved = all.find(e => e.downloadKey === downloadKey);
            if (saved) ThumbnailCache.localizeEntry(saved).then(e => DownloadIndex.addEntry(e)).catch(() => {});
          }).catch(() => {});
        })
        .catch(err => {
          console.warn("[ProviderDownload] download failed:", err);
          finish();
          setMode("choosing");
        });
    } else {
      setReady(true);
    }
  };

  const handleBack = () => {
    if (props.backToPage) {
      props.navigateTo(props.backToPage, props.backToData);
      return;
    }
    const stack = props.folderStack || [];
    const currentGridFolder = stack[stack.length - 1];
    // A file selected from within a browseAsGrid folder's own grid should
    // return to that same grid on back, not pop past it to the parent.
    const targetStack = currentGridFolder?.browseAsGrid ? stack : stack.slice(0, -1);
    props.navigateTo("contentBrowser", {
      providerId: props.providerId,
      folderStack: targetStack
    });
  };

  const init = () => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => { handleBack(); return true; });

    // If the video is already fully downloaded, skip straight to
    // playback — no Download/Stream/Start button should ever show.
    const files = CachedData.messageFiles;
    if (CachedData.downloadingEntries[downloadKey]) {
      setMode("downloading");
      return () => { backHandler.remove(); };
    }
    if (files && files.length > 0) {
      isDownloadedForThisAccount(files).then(allCached => {
        if (allCached) {
          setCachedItems(files.length);
          setTotalItems(files.length);
          setReady(true);
          handleStart();
        } else {
          setMode("choosing");
        }
      });
    } else {
      setMode("choosing");
    }

    return () => {
      backHandler.remove();
    };
  };

  useEffect(init, []);
  useEffect(() => {
    if (ready && cachedItems === totalItems && mode === "downloading") {
      setMode("ready");
      Animated.timing(buttonFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  }, [ready, cachedItems, totalItems, mode]);
  useEffect(() => {
    if (mode === "ready") {
      Animated.timing(buttonFadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  }, [mode]);

  // While a download for this video/lesson runs (started here, or earlier and
  // this screen was left and reopened), mirror its progress and notice when
  // it finishes or fails.
  useEffect(() => {
    if (mode !== "downloading") return undefined;
    let cancelled = false;
    const tick = async () => {
      const entry = CachedData.downloadingEntries[downloadKey];
      if (entry) {
        const total = entry.filesTotal ?? 0;
        const cached = entry.filesCached ?? 0;
        setTotalItems(total);
        setCachedItems(cached);
        setCurrentFileProgress(total > 0 ? Math.max(0, Math.min(1, (entry.progress / 100) * total - cached)) : 0);
        return;
      }
      if (downloadActiveRef.current) return; // this screen's own download is still starting up
      const files = CachedData.messageFiles || [];
      if (files.length > 0 && (await CachedData.allFilesCached(files))) {
        if (!cancelled) {
          setCachedItems(files.length);
          setTotalItems(files.length);
          setReady(true);
        }
      } else if (!cancelled) {
        setMode("choosing");
      }
    };
    const id = setInterval(tick, 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  // Use cover image, fall back to parent folder image, then provider logo
  const getBackgroundImage = () => {
    if (props.coverImage) return { uri: props.coverImage, isSvg: false };
    // Check parent folders for an image (most recent first)
    if (props.folderStack) {
      for (let i = props.folderStack.length - 1; i >= 0; i--) {
        const folder = props.folderStack[i];
        if (folder.thumbnail) return { uri: folder.thumbnail, isSvg: false };
      }
    }
    const provider = getProvider(props.providerId);
    const logo = provider?.logos?.dark || provider?.logos?.light;
    if (logo) {
      const isSvg = logo.toLowerCase().endsWith(".svg");
      return { uri: logo, isSvg };
    }
    return undefined;
  };
  const background = getBackgroundImage();

  const content = (
    <LinearGradient colors={["rgba(0, 0, 0, 1)", "rgba(0, 0, 0, 0)"]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }}>
      <View style={{ flex: 9, justifyContent: "flex-end", flexDirection: "column" }}>
        <View style={{ justifyContent: "flex-start", flexDirection: "row", paddingLeft: DimensionHelper.wp("5%") }}>
          <View style={{ maxWidth: "60%" }}>
            {getContent()}
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }}></View>
    </LinearGradient>
  );

  return (
    <View style={{ ...Styles.menuScreen, flex: 1, flexDirection: "row" }} testID={`pd-root-${mode}`}>
      {background && !background.isSvg ? (
        <ImageBackground source={{ uri: background.uri }} resizeMode="contain" style={{ flex: 1, width: "100%" }}>
          {content}
        </ImageBackground>
      ) : background?.isSvg ? (
        <View style={{ flex: 1, width: "100%" }}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", opacity: 0.3 }}>
            <SvgUri uri={background.uri} width="50%" height="50%" />
          </View>
          {content}
        </View>
      ) : (
        <View style={{ flex: 1, width: "100%" }}>
          {content}
        </View>
      )}
    </View>
  );
};
