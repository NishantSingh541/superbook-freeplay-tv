import React from "react";
import { useTranslation } from "react-i18next";
import { CachedData } from "../helpers";
import RNFS from "react-native-fs";
import { Colors } from "../helpers/Styles";
import { MessageFileInterface } from "../interfaces";
import { Image, View, Text, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { DimensionHelper } from "../helpers/DimensionHelper";
import Video from "react-native-video";
import Icon from "react-native-vector-icons/MaterialIcons";


type Props = {
  file: MessageFileInterface,
  downloaded: boolean,
  paused: boolean,
  muted?: boolean,
  onProgress?: (data: { currentTime: number; playableDuration: number }) => void,
  onEnd?: () => void
};

export type MessageHandle = {
  seek: (time: number) => void;
};

export const Message = React.forwardRef<MessageHandle, Props>((props, ref) => {
  const { t } = useTranslation();
  const videoRef = React.useRef<any>(null);
  const [internalPaused, setInternalPaused] = React.useState(props.paused);
  const [hasError, setHasError] = React.useState(false);
  const [showError, setShowError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showLoadingOverlay, setShowLoadingOverlay] = React.useState(false);

  React.useImperativeHandle(ref, () => ({ seek: (time: number) => { videoRef.current?.seek(time); } }));

  React.useEffect(() => {
    setInternalPaused(props.paused);
  }, [props.paused]);

  React.useEffect(() => {
    setInternalPaused(props.paused);
    setHasError(false);
    setShowError(false);
    setIsLoading(true);
    setShowLoadingOverlay(false);
  }, [props.file]);

  const [filePath, setFilePath] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!props.file?.url) {
        if (!cancelled) setFilePath(null);
        return;
      }
      if (props.downloaded) {
        const localPath = decodeURIComponent(CachedData.getFilePath(props.file.url));
        let exists = false;
        try {
          exists = await RNFS.exists(localPath);
        } catch (err) {
          console.warn("[Message] Error checking local file existence:", err);
        }
        if (cancelled) return;
        if (exists) {
          setFilePath("file://" + localPath);
        } else {
          console.warn("[Message] Expected downloaded file not found, falling back to streaming URL:", localPath);
          setFilePath(props.file.url);
          CachedData.load(props.file).then(() => {
            console.log("[Message] Silently re-downloaded missing local file:", localPath);
          }).catch(err => {
            console.warn("[Message] Background re-download failed:", err);
          });
        }
      } else {
        if (!cancelled) setFilePath(props.file.url);
      }
    })();
    return () => { cancelled = true; };
  }, [props.file, props.downloaded]);

  // Delay showing loading overlay by 1 second to avoid flashing on quick transitions
  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading && !hasError) {
      timer = setTimeout(() => setShowLoadingOverlay(true), 1000);
    } else {
      setShowLoadingOverlay(false);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [isLoading, hasError]);

  const handleVideoError = (_error: any) => {
    setIsLoading(false);
    setHasError(true);
    setShowError(true);
    // Show error briefly, then auto-advance
    setTimeout(() => {
      setShowError(false);
      if (props.onEnd) props.onEnd();
    }, 3000);
  };

  // Safety timeout: if video hasn't loaded within 15 seconds, auto-advance
  React.useEffect(() => {
    if (!isLoading || hasError) return;
    const url = props.file.url || "";
    const isVideo = props.file.fileType === "video"
      || /\.(mp4|webm)$/i.test(url.split("?")[0])
      || url.includes("externalVideos");
    if (!isVideo) return;

    const safetyTimer = setTimeout(() => {
      console.log("Video load timeout, advancing to next:", props.file?.url);
      handleVideoError({ error: "timeout" });
    }, 15000);

    return () => clearTimeout(safetyTimer);
  }, [isLoading, hasError, props.file]);

  // const getMessageType = () => {
  //   const parts = props.file.url.split("?")[0].split(".");
  //   const ext = parts[parts.length - 1];
  //   let result = "image"
  //   switch (ext.toLocaleLowerCase()) {
  //     case "webm":
  //     case "mp4":
  //       result = "video"
  //       break;
  //   }

  //   if (props.file.url.indexOf("externalVideos") > -1) result = "video";

  //   //console.log("Message Type:", result, props.file.url.split("?")[0])
  //   return result;
  // }

  const getMessageType = (): "image" | "video" => {
    if (props.file.fileType === "video") return "video";

    const url = props.file.url || "";
    const parts = url.split("?")[0].split(".");
    const ext = parts[parts.length - 1].toLowerCase();
    if (ext === "webm" || ext === "mp4" || url.includes("externalVideos")) {
      return "video";
    }
    return "image";
  };

  // const getContent = () => {
  //   let result = <></>
  //   switch (getMessageType()) {
  //     case "image":
  //       result = getImage();
  //       break;
  //     case "video":
  //       result = getVideo();
  //       break;
  //   }
  //   return result
  // }

  const getVideo = () => {
    return (<Video
      ref={videoRef}
      source={{ uri: filePath }}
      repeat={props.file.loopVideo}
      resizeMode={Platform.isTV ? "cover" : "contain"}
      style={{ width: DimensionHelper.wp("100%"), height: DimensionHelper.hp("100%") }}
      paused={internalPaused}
      muted={props.muted ?? false}
      playInBackground={false}
      playWhenInactive={false}
      onProgress={props.onProgress}
      onLoad={() => setIsLoading(false)}
      onBuffer={({ isBuffering }) => setIsLoading(isBuffering)}
      onEnd={props.file.loopVideo ? undefined : props.onEnd}
      onError={handleVideoError}
      controls={false}
      disableFocus={true}
    />);
  };

  const getImage = () => {
    return (<Image
      source={{ uri: filePath }}
      style={{ width: DimensionHelper.wp("100%"), height: DimensionHelper.hp("100%") }}
      onLoad={() => setIsLoading(false)}
      onError={() => handleVideoError({ error: "image load failed" })}
    />);
  };

  const content = React.useMemo(() => {
    if (!filePath) return null;
    return getMessageType() === "video" ? getVideo() : getImage();
  }, [props.file, internalPaused, props.downloaded, filePath]);

  const loadingOverlay = (
    <View style={styles.loadingOverlay}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.loadingSubtitle}>
        {getMessageType() === "video" ? t("message.loadingVideo") : t("message.loadingImage")}
      </Text>
    </View>
  );

  const errorOverlay = (
    <View style={styles.errorOverlay}>
      <Icon name="error-outline" size={48} color={Colors.error} />
      <Text style={styles.errorTitle}>{t("message.videoFailed")}</Text>
      <Text style={styles.errorSubtitle}>{t("message.skippingNext")}</Text>
    </View>
  );

  const messageState = hasError ? "error" : (isLoading ? "loading" : "ready");

  return (
    <View style={{ flex: 1 }} testID={`message-${messageState}`}>
      {content}
      {showLoadingOverlay && loadingOverlay}
      {showError && errorOverlay}
    </View>
  );

});

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center"
  },
  loadingSubtitle: {
    fontSize: 20,
    color: Colors.textLight,
    marginTop: 16
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center"
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: Colors.error,
    marginTop: 12
  },
  errorSubtitle: {
    fontSize: 18,
    color: Colors.textLight,
    marginTop: 8
  }
});




