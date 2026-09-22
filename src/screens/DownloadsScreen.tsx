import React, { useEffect, useState, useRef } from "react";
import { Alert, Image, View, Text, FlatList, TouchableHighlight, BackHandler } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "react-native-vector-icons/MaterialIcons";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { DownloadedItemInterface } from "../interfaces";
import { CachedData, Styles, Colors, Typography, DownloadIndex, StorageManager, CbnAutoDownload } from "../helpers";
import { PlayerHelper } from "../helpers/PlayerHelper";
import { MenuHeader, EmptyState, SkeletonCard } from "../components";

type Props = {
  navigateTo(page: string, data?: any): void;
  sidebarState: (state: boolean) => void;
  sidebarExpanded?: boolean;
};

type DownloadingItem = { downloadKey: string; title: string; image?: string; progress: number; filesCached?: number; filesTotal?: number };
type PendingItem = { downloadKey: string; title: string; image?: string };

export const DownloadsScreen = (props: Props) => {
  const { t } = useTranslation();
  const [downloads, setDownloads] = useState<DownloadedItemInterface[]>([]);
  const [downloading, setDownloading] = useState<DownloadingItem[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [lowStorage, setLowStorage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  // The lesson currently drilled into, showing its individual videos.
  const [pickerEntry, setPickerEntry] = useState<DownloadedItemInterface | null>(null);

  const prevDownloadingKeysRef = useRef<Set<string>>(new Set());

  const styles: any = {
    list: {
      flex: 1,
      marginHorizontal: "auto",
      width: "100%",
      paddingHorizontal: DimensionHelper.wp("1%")
    },
    item: {
      flex: 1,
      maxWidth: "31%",
      alignItems: "center",
      marginHorizontal: DimensionHelper.wp("1%"),
      padding: 10,
      borderRadius: 16
    }
  };

  const loadData = () => {
    setLoading(true);
    DownloadIndex.getVerifiedEntries(true).then(entries => {
      setDownloads(entries);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  };

  useEffect(() => {
    const poll = () => {
      const currentKeys = new Set(Object.keys(CachedData.downloadingEntries));
      let somethingFinished = false;
      prevDownloadingKeysRef.current.forEach(key => {
        if (!currentKeys.has(key)) somethingFinished = true;
      });
      prevDownloadingKeysRef.current = currentKeys;

      const entries = Object.entries(CachedData.downloadingEntries).map(([downloadKey, v]) => ({
        downloadKey,
        title: v.title,
        image: v.image,
        progress: v.progress,
        filesCached: v.filesCached,
        filesTotal: v.filesTotal
      }));
      setDownloading(entries);
      const pendingEntries = Object.entries(CachedData.pendingEntries).map(([downloadKey, v]) => ({
        downloadKey,
        title: v.title,
        image: v.image
      }));
      setPending(pendingEntries);
      setLowStorage(CachedData.lowStorageNotice);

      if (somethingFinished) {
        loadData();
      }
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, []);

  const playEntry = (entry: DownloadedItemInterface, startIndex: number = 0) => {
    CachedData.messageFiles = entry.messageFiles;
    CachedData.setAsyncStorage("messageFiles", entry.messageFiles);
    StorageManager.touchEntry(entry.downloadKey);
    PlayerHelper.pendingPause = false;
    props.navigateTo("player", { downloadedLesson: true, providerStartIndex: startIndex });
  };

  const handleDelete = async (entry: DownloadedItemInterface) => {
    await DownloadIndex.deleteFiles(entry);
    await DownloadIndex.removeEntry(entry.downloadKey);
    setDownloads(prev => prev.filter(d => d.downloadKey !== entry.downloadKey));
    if (pickerEntry?.downloadKey === entry.downloadKey) setPickerEntry(null);
  };

  const confirmDelete = (entry: DownloadedItemInterface) => {
    Alert.alert(
      t("downloads.deleteConfirmTitle", "Delete Download?"),
      t("downloads.deleteConfirmMessage", `This will remove "${entry.title || ""}" and all its videos from this device.`),
      [
        { text: t("downloads.deleteConfirmNo", "No"), style: "cancel" },
        { text: t("downloads.deleteConfirmYes", "Yes"), style: "destructive", onPress: () => handleDelete(entry) }
      ]
    );
  };

  const formatDownloadedDate = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  // --- Lesson card (grouped view) ---
  const getLessonCard = (entry: DownloadedItemInterface, index: number) => {
    const isFocused = focusedKey === entry.downloadKey;
    const isDeleteFocused = focusedKey === `${entry.downloadKey}-delete`;
    const videoCount = entry.messageFiles?.length ?? 0;

    return (
      <View style={{ ...styles.item }}>
        <View style={{
          width: "100%",
          borderRadius: 14,
          overflow: "hidden",
          borderWidth: 4,
          borderColor: isFocused ? Colors.primary : "transparent"
        }}>
          <TouchableHighlight
            testID={`download-lesson-${entry.downloadKey}${isFocused ? "-focused" : ""}`}
            underlayColor={Colors.pressedBackground}
            onPress={() => setPickerEntry(entry)}
            onFocus={() => setFocusedKey(entry.downloadKey)}
            onBlur={() => setFocusedKey(prev => (prev === entry.downloadKey ? null : prev))}
            hasTVPreferredFocus={!props.sidebarExpanded && index === 0}
          >
            <View>
              {entry.image ? (
                <Image
                  style={{ height: DimensionHelper.hp("25%"), width: "100%" }}
                  resizeMode="cover"
                  source={{ uri: entry.image }}
                />
              ) : (
                <View style={{ height: DimensionHelper.hp("25%"), width: "100%", backgroundColor: Colors.backgroundCard, justifyContent: "center", alignItems: "center" }}>
                  <Icon name="video-library" size={DimensionHelper.wp("4%")} color="rgba(255,255,255,0.5)" />
                </View>
              )}
              <View style={{ padding: 8, backgroundColor: Colors.backgroundCard }}>
                <Text style={{ ...Styles.smallWhiteText }} numberOfLines={2}>{entry.title}</Text>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 }}>
                  {t("downloads.episodeCount", "{{count}} episodes", { count: videoCount })}
                  {entry.downloadedAt ? ` • ${formatDownloadedDate(entry.downloadedAt)}` : ""}
                </Text>
              </View>
            </View>
          </TouchableHighlight>

          <TouchableHighlight
            testID={`download-lesson-delete-${entry.downloadKey}${isDeleteFocused ? "-focused" : ""}`}
            underlayColor="rgba(255,0,0,0.5)"
            onPress={() => confirmDelete(entry)}
            onFocus={() => setFocusedKey(`${entry.downloadKey}-delete`)}
            onBlur={() => setFocusedKey(prev => (prev === `${entry.downloadKey}-delete` ? null : prev))}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: DimensionHelper.hp("1%"),
              backgroundColor: isDeleteFocused ? "rgba(255,0,0,0.25)" : Colors.backgroundCard,
              borderTopWidth: 1,
              borderTopColor: Colors.borderSubtle
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Icon name="delete" size={DimensionHelper.wp("1.8%")} color={isDeleteFocused ? "#ff6b6b" : Colors.textLight} />
              <Text style={{ ...Styles.smallerWhiteText, color: isDeleteFocused ? "#ff6b6b" : Colors.textLight, marginLeft: 6 }}>
                {t("downloads.delete", "Delete")}
              </Text>
            </View>
          </TouchableHighlight>
        </View>
      </View>
    );
  };

  // --- Individual video card (drill-down / picker view) ---
  const getVideoCard = (file: any, fileIndex: number, entry: DownloadedItemInterface, index: number) => {
    const cardKey = `${entry.downloadKey}__${fileIndex}`;
    const isFocused = focusedKey === cardKey;

    return (
      <View style={{ ...styles.item }}>
        <TouchableHighlight
          testID={`download-video-${cardKey}${isFocused ? "-focused" : ""}`}
          underlayColor={Colors.pressedBackground}
          onPress={() => playEntry(entry, fileIndex)}
          onFocus={() => setFocusedKey(cardKey)}
          onBlur={() => setFocusedKey(prev => (prev === cardKey ? null : prev))}
          hasTVPreferredFocus={index === 0}
        >
          <View style={{
            width: "100%",
            borderRadius: 12,
            overflow: "hidden",
            borderWidth: 4,
            borderColor: isFocused ? Colors.primary : "transparent"
          }}>
            <View style={{ position: "relative" }}>
              {file.image ? (
                <Image
                  style={{ height: DimensionHelper.hp("25%"), width: "100%" }}
                  resizeMode="cover"
                  source={{ uri: file.image }}
                />
              ) : (
                <View style={{ height: DimensionHelper.hp("25%"), width: "100%", backgroundColor: Colors.backgroundCard, justifyContent: "center", alignItems: "center" }}>
                  <Icon name="play-circle-outline" size={DimensionHelper.wp("4%")} color="rgba(255,255,255,0.5)" />
                </View>
              )}
              {file.image && (
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
                  <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 30, padding: 8 }}>
                    <Icon name="play-arrow" size={DimensionHelper.wp("3%")} color="#fff" />
                  </View>
                </View>
              )}
            </View>
            <View style={{ padding: 8, backgroundColor: Colors.backgroundCard }}>
              <Text style={{ ...Styles.smallWhiteText }} numberOfLines={2}>{file.name}</Text>
              <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 }}>
                {t("contentBrowser.fileType.video", "Video")}
              </Text>
            </View>
          </View>
        </TouchableHighlight>
      </View>
    );
  };

  const getDownloadingCard = (item: DownloadingItem) => (
    <View key={item.downloadKey} style={{ ...styles.item }}>
      <View style={{ width: "100%", borderRadius: 14, overflow: "hidden" }}>
        <View>
          {item.image ? (
            <Image
              style={{ height: DimensionHelper.hp("25%"), width: "100%" }}
              resizeMode="cover"
              blurRadius={12}
              source={{ uri: item.image }}
            />
          ) : (
            <View style={{ height: DimensionHelper.hp("25%"), width: "100%", backgroundColor: Colors.backgroundCard, justifyContent: "center", alignItems: "center" }}>
              <Icon name="file-download" size={DimensionHelper.wp("4%")} color={Colors.textLight} />
            </View>
          )}
          <View style={{ padding: 8, backgroundColor: Colors.backgroundCard }}>
            <Text style={{ ...Styles.smallWhiteText }} numberOfLines={1}>{item.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
              <Text style={{ ...Styles.smallerWhiteText, color: Colors.primary }}>
                {t("downloads.downloading", "Downloading...")} {item.progress}%
                {item.filesTotal && item.filesTotal > 1 ? ` • ${item.filesCached ?? 0}/${item.filesTotal} videos` : ""}
              </Text>
            </View>
            <View style={{ height: 4, width: "100%", backgroundColor: Colors.progressBackground, borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
              <View style={{ height: 4, width: `${item.progress}%`, backgroundColor: Colors.primary }} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const getPendingCard = (item: PendingItem) => (
    <View key={item.downloadKey} style={{ ...styles.item }}>
      <View style={{ width: "100%", borderRadius: 14, overflow: "hidden", opacity: 0.6 }}>
        <View>
          {item.image ? (
            <Image
              style={{ height: DimensionHelper.hp("25%"), width: "100%" }}
              resizeMode="cover"
              blurRadius={12}
              source={{ uri: item.image }}
            />
          ) : (
            <View style={{ height: DimensionHelper.hp("25%"), width: "100%", backgroundColor: Colors.backgroundCard, justifyContent: "center", alignItems: "center" }}>
              <Icon name="schedule" size={DimensionHelper.wp("4%")} color={Colors.textLight} />
            </View>
          )}
          <View style={{ padding: 8, backgroundColor: Colors.backgroundCard }}>
            <Text style={{ ...Styles.smallWhiteText }} numberOfLines={1}>{item.title}</Text>
            <Text style={{ ...Styles.smallerWhiteText, color: Colors.textSubtle, marginTop: 4 }}>
              {t("downloads.pending", "Pending")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const getCards = () => {
    if (pickerEntry) {
      const files = pickerEntry.messageFiles || [];
      return (
        <View style={styles.list}>
          <FlatList
            data={files}
            numColumns={3}
            keyExtractor={(_file, idx) => `${pickerEntry.downloadKey}__${idx}`}
            renderItem={(data) => getVideoCard(data.item, data.index, pickerEntry, data.index)}
          />
        </View>
      );
    }

    if (loading) {
      const skeletonData = Array.from({ length: 6 }, (_, i) => ({ id: `skeleton-${i}` }));
      return (
        <View style={styles.list}>
          <FlatList data={skeletonData} numColumns={3} keyExtractor={item => item.id} renderItem={() => (
            <View style={{ ...styles.item, padding: 10 }}>
              <SkeletonCard width="100%" height={DimensionHelper.hp("33%")} />
            </View>
          )} />
        </View>
      );
    }
    if (downloads.length === 0 && downloading.length === 0 && pending.length === 0) {
      return <EmptyState icon="file-download" message={t("downloads.noDownloads")} />;
    }

    type CombinedItem =
      | { kind: "pending"; item: PendingItem }
      | { kind: "downloading"; item: DownloadingItem }
      | { kind: "lesson"; item: DownloadedItemInterface };
    const combined: CombinedItem[] = [
      ...downloading.map(item => ({ kind: "downloading" as const, item })),
      ...pending.map(item => ({ kind: "pending" as const, item })),
      ...downloads.map(item => ({ kind: "lesson" as const, item }))
    ];

    return (
      <View style={styles.list}>
        <FlatList<CombinedItem>
          data={combined}
          numColumns={3}
          renderItem={(data) =>
            data.item.kind === "downloading"
              ? getDownloadingCard(data.item.item)
              : data.item.kind === "pending"
                ? getPendingCard(data.item.item)
                : getLessonCard(data.item.item, data.index)
          }
          keyExtractor={(data) => (data.kind === "lesson" ? data.item.downloadKey : data.item.downloadKey)}
        />
      </View>
    );
  };

  const handleBack = () => {
    if (pickerEntry) {
      setPickerEntry(null);
      return;
    }
    props.sidebarState(true);
  };

  const init = () => {
    loadData();
    CbnAutoDownload.run();
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => { handleBack(); return true; });
    return () => backHandler.remove();
  };

  useEffect(init, []);

  return (
    <View style={{ ...Styles.menuScreen }} testID="downloads-root">
      <MenuHeader headerText={pickerEntry ? pickerEntry.title || t("downloads.header") : t("downloads.header")} />
      {pickerEntry && (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: DimensionHelper.wp("2.5%"), paddingVertical: DimensionHelper.hp("1%"), backgroundColor: Colors.surfaceDark }}>
          <Text style={{ color: Colors.textSubtle, fontSize: Typography?.labelLarge ?? 14 }}>
            {t("downloads.header", "Downloads")}
            {" › "}
            {(pickerEntry.category === 455 ? t("cbnToday.preschoolCategory", "Preschool") : pickerEntry.category === 454 ? t("cbnToday.primaryCategory", "Primary School") : "")}
            {pickerEntry.category ? " › " : ""}
            {pickerEntry.title}
          </Text>
          <View style={{ flex: 1 }} />
          {pickerEntry.downloadedAt && (
            <Text style={{ color: Colors.textSubtle, fontSize: Typography?.labelSmall ?? 12 }}>
              {t("downloads.downloadedOn", "Downloaded {{date}}", { date: formatDownloadedDate(pickerEntry.downloadedAt) })}
            </Text>
          )}
        </View>
      )}
      {lowStorage && !pickerEntry && (
        <View style={{ backgroundColor: "#5c1a1a", paddingVertical: DimensionHelper.hp("1%"), paddingHorizontal: DimensionHelper.wp("2.5%") }}>
          <Text style={{ color: "#fff", fontSize: 13, textAlign: "center" }}>
            {t("downloads.lowStorage", "Storage is full — some downloads are paused until space frees up.")}
          </Text>
        </View>
      )}
      <View style={{ ...Styles.menuWrapper, flex: 90 }}>
        {getCards()}
      </View>
    </View>
  );
};
