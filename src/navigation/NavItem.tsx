import { DimensionHelper } from "../helpers/DimensionHelper";
import React, { useState, useRef } from "react";
import { Text, TouchableHighlight, View, Image } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { SvgUri } from "react-native-svg";
import { Styles, Colors } from "../helpers";

type Props = {
  icon: string;
  text: string;
  selected: boolean;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  onPress?: () => void;
  nextFocusDown?: any;
  nextFocusUp?: any;
  logoUrl?: string;
  testID?: string;
};

// Returns true for light colours (e.g. white focus fill), so the icon/label can switch to a
// dark colour. Accepts "#RGB", "#RRGGBB", "rgb(...)" and "rgba(...)". Anything it can't read
// (or "transparent") counts as dark, which keeps the normal light-on-dark sidebar text.
const isLightColor = (color: string | undefined): boolean => {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === "transparent") return false;

  let r: number, g: number, b: number;
  if (c.startsWith("#")) {
    const hex = c.length === 4
      ? c.slice(1).split("").map(ch => ch + ch).join("")
      : c.slice(1, 7);
    if (hex.length !== 6) return false;
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const parts = m[1].split(",").map(p => parseFloat(p));
    [r, g, b] = parts;
    if (parts.length > 3 && parts[3] < 0.5) return false; // mostly see-through: background shows
  }
  if ([r, g, b].some(n => isNaN(n))) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
};

// Dark text for light backgrounds: use the brand focusText if it is actually dark,
// otherwise fall back to the dark app background (navy).
const DARK_ON_LIGHT = isLightColor(Colors.focusText) ? Colors.backgroundDark : Colors.focusText;


export const NavItem = React.forwardRef((props: Props, ref) => {
  // Track if this is the initial mount - only use hasTVPreferredFocus on first render
  const isInitialMount = useRef(true);
  const [, forceUpdate] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  const handleFocusChange = (focused: boolean) => {
    // After first focus event, disable hasTVPreferredFocus to allow normal navigation
    if (isInitialMount.current) {
      isInitialMount.current = false;
      forceUpdate(n => n + 1);
    }
    // Expand sidebar when NavItem receives focus (user navigated left to sidebar)
    if (focused) {
      props.setExpanded(true);
    }
  };

  // Background first, then pick a text/icon colour that is readable on it.
  // Previously the colour was chosen separately, so a white focus fill could end up
  // with white text/icon (invisible) - most visible while content is loading, because
  // the remote's focus has nowhere to go except the sidebar.
  const background = props.selected
    ? Colors.primary
    : isFocused ? Colors.focusFill : "transparent";

  const color = isLightColor(background)
    ? DARK_ON_LIGHT
    : (props.selected || isFocused) ? Colors.textPrimary : Colors.textSecondary;

  // Icon box: was wp 10% (~192px at 1080p) around a ~63px icon, which left a wide gap and
  // squeezed the label ("Today's Lesson" truncated). wp 5% still fits the icon and keeps it
  // centred in the collapsed sidebar, and every item uses the same box so icons stay aligned.
  const iconContainer = {
    width: DimensionHelper.wp("5%"),
    alignItems: "center",
    justifyContent: "center"
  } as any;

  return (
    <TouchableHighlight
      testID={props.testID}
      // The visible pill is the inner View below, driven only by our own focus/selected state.
      // TouchableHighlight's underlay is kept fully transparent: on Android TV it is painted on
      // native focus (and can lag behind or stick while the JS thread is busy loading content),
      // which produced the white box with an invisible white icon.
      underlayColor="transparent"
      activeOpacity={1}
      onPress={() => {
        props.setExpanded(false);
        if (props.onPress) props.onPress();
      }}
      style={{
        marginTop: DimensionHelper.wp("1%"),
        marginHorizontal: DimensionHelper.wp("1%"),
        borderRadius: 10,
        overflow: "hidden",
        alignSelf: "stretch",
        transform: [{ scale: isFocused ? 1.05 : 1 }]
      }}
      hasTVPreferredFocus={isInitialMount.current && props.expanded && props.selected}
      onFocus={() => {
        setIsFocused(true);
        handleFocusChange(true);
      }}
      onBlur={() => {
        setIsFocused(false);
        handleFocusChange(false);
      }}
      ref={ref as any}
      {...({
        nextFocusDown: props.nextFocusDown,
        nextFocusUp: props.nextFocusUp
      } as any)}>
      <View
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: background,
          borderWidth: 2, // always 2 so nothing shifts
          borderColor: isFocused && props.selected ? "rgba(255,255,255,0.85)" : "transparent"
        }}>
        <View style={iconContainer}>
          {props.logoUrl ? (
            props.logoUrl.toLowerCase().endsWith(".svg") ? (
              <SvgUri
                uri={props.logoUrl}
                width={DimensionHelper.hp("5.5%")}
                height={DimensionHelper.hp("5.5%")}
              />
            ) : (
              <Image
                source={{ uri: props.logoUrl }}
                style={{
                  width: DimensionHelper.hp("5.5%"),
                  height: DimensionHelper.hp("5.5%")
                }}
                resizeMode="contain"
              />
            )
          ) : (
            <Icon
              name={props.icon}
              color={color}
              size={DimensionHelper.hp("5.8%")}
            />
          )}
        </View>
        {props.expanded && (
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              ...Styles.smallWhiteText,
              fontSize: DimensionHelper.wp("1.4%"),
              color: color,
              flex: 1,
              marginLeft: DimensionHelper.wp("0.6%"),
              textAlign: "left"
            }}>
            {props.text}
          </Text>
        )}
      </View>
    </TouchableHighlight>
  );
});
