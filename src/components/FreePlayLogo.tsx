import React from "react";
import { View, Image, StyleSheet } from "react-native";

type Props = {
  size?: "small" | "medium" | "large";
  showText?: boolean;
  color?: string; // Kept for API compatibility but not used with image-based logo
};

// Import logo images
const LogoWhite = require("../images/logo-white.png");
const LogoIcon = require("../images/logo-icon.png");

export const FreePlayLogo = ({
  size = "medium",
  showText = true
}: Props) => {
  // Sized for Superbook Academy's logo (mascot + two-line wordmark),
  // which needs more vertical room to stay legible than FreePlay's
  // original single-mark logo did. Width ratio matches the real ~3.2:1
  // aspect of the wordmark artwork, not an arbitrary 4:1 guess.
  const sizes = {
    small: { height: 55, iconSize: 55 },
    medium: { height: 85, iconSize: 85 },
    large: { height: 160, iconSize: 160 }
  };

  const s = sizes[size];

  // Use full logo with text or just the icon
  const logoSource = showText ? LogoWhite : LogoIcon;

  return (
    <View style={[styles.container, showText && styles.containerExpanded]}>
      <Image
        source={logoSource}
        style={showText ? {
          width: s.height * 3.2,
          height: s.height
        } : {
          width: s.iconSize,
          height: s.iconSize
        }}
        resizeMode="contain"
      />
    </View>
  );
};

// White version for dark backgrounds (same as default since we use white logo)
export const FreePlayLogoWhite = ({
  size = "medium",
  showText = true
}: Omit<Props, "color">) => {
  return <FreePlayLogo size={size} showText={showText} />;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  containerExpanded: { width: "100%" }
});
