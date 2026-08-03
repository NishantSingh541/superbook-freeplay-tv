import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, Animated, LayoutChangeEvent } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Colors } from "../helpers/Styles";

type Props = {
  paused: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onToggleMute: () => void;
  visible: boolean;
  onRequestHide: () => void;
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const VideoControls = (props: Props) => {
  const [seekBarWidth, setSeekBarWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const seekBarWidthRef = useRef(0);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(props.visible ? 1 : 0)).current;
  const [isFullyHidden, setIsFullyHidden] = useState(!props.visible);

  const onSeekBarLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setSeekBarWidth(w);
    seekBarWidthRef.current = w;
  };

  const timeFromTouchX = useCallback((touchX: number): number => {
    const width = seekBarWidthRef.current;
    if (width <= 0 || !isFinite(props.duration) || props.duration <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, touchX / width));
    return ratio * props.duration;
  }, [props.duration]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setIsDragging(true);
        const t = timeFromTouchX(evt.nativeEvent.locationX);
        setDragTime(t);
      },
      onPanResponderMove: (evt) => {
        const t = timeFromTouchX(evt.nativeEvent.locationX);
        setDragTime(t);
      },
      onPanResponderRelease: (evt) => {
        const t = timeFromTouchX(evt.nativeEvent.locationX);
        props.onSeek(t);
        setIsDragging(false);
      }
    })
  ).current;

  useEffect(() => {
    if (props.visible) setIsFullyHidden(false);
    Animated.timing(fadeAnim, {
      toValue: props.visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished && !props.visible) setIsFullyHidden(true);
    });

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (props.visible && !props.paused && !isDragging) {
      hideTimerRef.current = setTimeout(() => props.onRequestHide(), 4000);
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [props.visible, props.paused, isDragging]);

  const displayTime = isDragging ? dragTime : props.currentTime;
  const progressRatio = props.duration > 0 ? Math.max(0, Math.min(1, displayTime / props.duration)) : 0;

  if (isFullyHidden) return null;

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim }]}
      pointerEvents={props.visible ? "box-none" : "none"}
    >
      <View style={styles.bottomBar}>
        <TouchableOpacity testID="video-controls-play-pause" onPress={props.onPlayPause} style={styles.iconButton}>
          <Icon name={props.paused ? "play-arrow" : "pause"} size={32} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.timeText}>{formatTime(displayTime)}</Text>

        <View
          testID="video-controls-seekbar"
          style={styles.seekBarTrack}
          onLayout={onSeekBarLayout}
          {...panResponder.panHandlers}
        >
          <View style={styles.seekBarBackground} />
          <View style={[styles.seekBarFill, { width: `${progressRatio * 100}%` }]} />
          <View style={[styles.seekBarThumb, { left: `${progressRatio * 100}%` }]} />
        </View>

        <Text style={styles.timeText}>{formatTime(props.duration)}</Text>

        <TouchableOpacity testID="video-controls-mute" onPress={props.onToggleMute} style={styles.iconButton}>
          <Icon name={props.muted ? "volume-off" : "volume-up"} size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  iconButton: {
    padding: 8
  },
  timeText: {
    color: "#fff",
    fontSize: 13,
    minWidth: 42,
    textAlign: "center"
  },
  seekBarTrack: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    marginHorizontal: 8
  },
  seekBarBackground: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)"
  },
  seekBarFill: {
    position: "absolute",
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary
  },
  seekBarThumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#fff",
    marginLeft: -7,
    top: 9
  }
});
