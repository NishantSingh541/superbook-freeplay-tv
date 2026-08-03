import React, { useRef } from "react";
import { HWEvent, BackHandler, useTVEventHandler, Pressable, TextInput } from "react-native";
import { ContentFolder } from "../interfaces";
import { CachedData } from "../helpers";
import { PlayerHelper } from "../helpers/PlayerHelper";
import { SoundHelper } from "../helpers/SoundHelper";
import GestureRecognizer from "react-native-swipe-gestures";
import { useKeepAwake } from "expo-keep-awake";
import { Message, SelectMessage, MessageHandle, PlayerErrorBoundary, VideoControls } from "../components";

type Props = {
  navigateTo(page: string, data?: any): void;
  providerId?: string;
  providerStartIndex?: number;
  streaming?: boolean;
  folderStack?: ContentFolder[];
  downloadedLesson?: boolean;
  /**
   * Explicit override for where the hardware/remote Back button should
   * return to. When set, this takes priority over all the folder-stack-based
   * guessing below — needed for screens like CbnTodayScreen that jump
   * straight into playback with no real folder hierarchy to infer from.
   */
  backToPage?: string;
  backToData?: any;
};

export const PlayerScreen = (props: Props) => {
  useKeepAwake();

  const [showSelectMessage, setShowSelectMessage] = React.useState(false);
  const showSelectMessageRef = useRef(false);
  const [messageIndex, setMessageIndex] = React.useState(props.providerStartIndex ?? 0);
  const [paused, setPaused] = React.useState(false);
  const [triggerPauseCheck, setTriggerPauseCheck] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [controlsVisible, setControlsVisible] = React.useState(true);

  const isProviderMedia = !!props.providerId;

  const messageRef = useRef<MessageHandle>(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  const isVideoFile = (file: any) => {
    if (!file || !file.url) return false;
    if (file.fileType === "video") return true;
    const parts = file.url.split("?")[0].split(".");
    const ext = parts[parts.length - 1].toLowerCase();
    return ext === "webm" || ext === "mp4" || file.url.includes("externalVideos") || file.url.includes("stream.mux.com");
  };

  const init = () => {
    // Utilities.trackEvent("Player Screen");
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => { handleBack(); return true; });
    return () => {
      backHandler.remove();
    };
  };

  const handlePlayPause = () => {
    SoundHelper.playClick();
    const newPausedState = !paused;
    setPaused(newPausedState);
    PlayerHelper.pendingPause = newPausedState;

    if (newPausedState) stopTimer();
    else startTimer();
  };

  const handleRemotePress = async (pendingKey: string) => {
    if (showSelectMessage) return;
    handleTapToShowControls();
    switch (pendingKey) {
      case "right": handleSkipForward(); break;
      case "fastForward": handleRight(); break;
      case "left": handleSkipBack(); break;
      case "rewind": handleLeft(); break;
      case "up": handleUp(); break;
      case "previous":
      case "info":
      case "down": handleBack(); break;
      case "select":
      case "playPause": handlePlayPause(); break;
    }
  };

  useTVEventHandler((evt: HWEvent) => { handleRemotePress(evt.eventType); });

  const handleSkipForward = () => { stopTimer(); goForward(); startTimer(); };
  const handleSkipBack = () => { stopTimer(); goBack(); startTimer(); };

  const handleLeft = () => {
    const currentFile = CachedData.messageFiles?.[messageIndex];
    if (isVideoFile(currentFile)) {
      const newTime = Math.max(0, currentTimeRef.current - 10);
      messageRef.current?.seek(newTime);
    } else {
      stopTimer(); goBack(); startTimer();
    }
  };
  const handleRight = () => {
    const currentFile = CachedData.messageFiles?.[messageIndex];
    if (isVideoFile(currentFile)) {
      const newTime = Math.min(durationRef.current, currentTimeRef.current + 10);
      messageRef.current?.seek(newTime);
    } else {
      stopTimer(); goForward(); startTimer();
    }
  };
  const handleUp = () => { if (!showSelectMessage) { stopTimer(); setShowSelectMessage(true); } };

  const handleBack = () => {
    if (showSelectMessageRef.current) {
      setShowSelectMessage(false);
      startTimer();
    } else {
      stopTimer();
      if (props.backToPage) {
        props.navigateTo(props.backToPage, props.backToData);
      } else if (props.downloadedLesson) {
        props.navigateTo("downloads");
      } else if (isProviderMedia && props.providerId) {
        const stack = props.folderStack || [];
        const currentGridFolder = stack[stack.length - 1];
        // A file selected from within a browseAsGrid folder's own grid should
        // return to that same grid on back, not pop past it to the parent.
        const targetStack = currentGridFolder?.browseAsGrid ? stack : stack.slice(0, -1);
        props.navigateTo("contentBrowser", { providerId: props.providerId, folderStack: targetStack });
      } else if (CachedData.providerId) {
        props.navigateTo("planDownload");
      } else {
        props.navigateTo("providers");
      }
    }
  };

  const goForward = () => {
    if (paused) setPaused(false);
    // Guard against null/undefined messageFiles
    if (!CachedData.messageFiles || CachedData.messageFiles.length === 0) {
      handleBack();
      return;
    }
    const idx = messageIndex + 1;
    if (idx < CachedData.messageFiles.length) setMessageIndex(idx);
    else handleBack();
  };

  const goBack = () => {
    if (paused) setPaused(false);
    // Guard against null/undefined messageFiles
    if (!CachedData.messageFiles || CachedData.messageFiles.length === 0) {
      handleBack();
      return;
    }
    const idx = messageIndex - 1;
    if (idx >= 0) setMessageIndex(idx);
    else handleBack();
  };

  const stopTimer = () => {
    if (PlayerHelper.timer) {
      clearTimeout(PlayerHelper.timer);
      PlayerHelper.timer = null;
    }
  };

  const startTimer = () => {
    if (PlayerHelper.timer) clearTimeout(PlayerHelper.timer);
    // No timer needed - videos advance on completion, images don't auto-advance
  };

  const handleVideoEnd = () => {
    if (!paused) {
      goForward();
    }
  };

  const handleMessageSelect = (index: number) => {
    if (paused) setPaused(false);
    setShowSelectMessage(false);
    setMessageIndex(index);
    startTimer();
  };

  const handlePressablePress = () => {
    setTriggerPauseCheck(Math.random());
    handleTapToShowControls();
  };

  React.useEffect(init, []);
  React.useEffect(() => { showSelectMessageRef.current = showSelectMessage; }, [showSelectMessage]);
  React.useEffect(startTimer, [messageIndex]);
  React.useEffect(() => { if (PlayerHelper.pendingPause !== paused) handlePlayPause(); }, [triggerPauseCheck]);

  const handleProgress = (data: { currentTime: number, playableDuration: number }) => {
    const { currentTime: newTime, playableDuration } = data;
    currentTimeRef.current = newTime;
    durationRef.current = playableDuration;
    setCurrentTime(newTime);
    setDuration(playableDuration);
  };

  const handleControlsSeek = (time: number) => {
    messageRef.current?.seek(time);
    setCurrentTime(time);
  };

  const handleToggleMute = () => setMuted((m) => !m);

  const handleTapToShowControls = () => {
    setControlsVisible(true);
  };

  // Check if we have valid files to play
  const hasValidFiles = CachedData.messageFiles && CachedData.messageFiles.length > 0 && CachedData.messageFiles[messageIndex];

  // Navigate back if no valid files
  React.useEffect(() => {
    if (!hasValidFiles && !showSelectMessage) {
      handleBack();
    }
  }, [hasValidFiles, showSelectMessage]);

  // Show select message overlay
  if (showSelectMessage) return <SelectMessage onSelect={handleMessageSelect} currentIndex={messageIndex} />;

  // Guard against missing files - show nothing while navigating back
  if (!hasValidFiles) {
    return null;
  }

  // Get the current file to play
  const currentFile = CachedData.messageFiles[messageIndex];

  const config = { velocityThreshold: 0.3, directionalOffsetThreshold: 80 };

  const currentFileType = (() => {
    if (!currentFile || !currentFile.url) return "image"; // Default to image if file is invalid
    // Check explicit fileType first
    if (currentFile.fileType === "video") return "video";

    const parts = currentFile.url.split("?")[0].split(".");
    const ext = parts[parts.length - 1].toLowerCase();
    // Detect video by: extension, externalVideos download URL, or Mux stream URL
    if (ext === "webm" || ext === "mp4" || currentFile.url.includes("externalVideos") || currentFile.url.includes("stream.mux.com")) {
      return "video";
    }
    return "image";
  })();

  return (
    <PlayerErrorBoundary onBack={handleBack}>
      <GestureRecognizer onSwipeLeft={handleRight} onSwipeRight={handleLeft} onSwipeDown={handleUp} onSwipeUp={handleBack} config={config} style={{ flex: 1 }}>
        <Pressable testID="player-root" onPress={handlePressablePress} style={{ flex: 1 }}>
          <Message
            ref={messageRef}
            file={currentFile}
            downloaded={!props.streaming}
            paused={paused}
            muted={muted}
            onProgress={handleProgress}
            onEnd={handleVideoEnd}
          />
          <TextInput autoFocus style={{ display: "none" }} showSoftInputOnFocus={false} returnKeyType="none" />

          {currentFileType === "video" && (
            <VideoControls
              paused={paused}
              currentTime={currentTime}
              duration={duration}
              muted={muted}
              onPlayPause={handlePlayPause}
              onSeek={handleControlsSeek}
              onToggleMute={handleToggleMute}
              visible={controlsVisible}
              onRequestHide={() => setControlsVisible(false)}
            />
          )}

        </Pressable>
      </GestureRecognizer>
    </PlayerErrorBoundary>
  );
};

