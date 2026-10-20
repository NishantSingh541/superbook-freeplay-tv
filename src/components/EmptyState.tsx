import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableHighlight } from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { Colors } from "../helpers/Styles";
import { DimensionHelper } from "../helpers/DimensionHelper";

type Props = {
  icon?: string;
  message: string;
  subMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const EmptyState = ({ icon = "inbox", message, subMessage, actionLabel, onAction }: Props) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      <View style={styles.backplate}>
        <Icon name={icon} size={DimensionHelper.wp("5%")} color={Colors.textDimmed} />
      </View>
      <Text style={styles.message}>{message}</Text>
      {subMessage && <Text style={styles.subMessage}>{subMessage}</Text>}
      {actionLabel && onAction && (
        // Optional action (e.g. Retry). Focus style follows the client's spec: 3px white ring + 3% grow.
        <TouchableHighlight
          hasTVPreferredFocus={true}
          underlayColor={Colors.primaryDark}
          onPress={onAction}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            marginTop: DimensionHelper.hp("3%"),
            paddingVertical: DimensionHelper.hp("1.5%"),
            paddingHorizontal: DimensionHelper.wp("3%"),
            borderRadius: 12,
            backgroundColor: Colors.primaryDark,
            borderWidth: 3,
            borderColor: focused ? Colors.focusRing : "transparent",
            transform: [{ scale: focused ? 1.03 : 1 }]
          }}
        >
          <Text style={{ color: Colors.textPrimary, fontSize: DimensionHelper.wp("1.4%"), fontWeight: "600" }}>{actionLabel}</Text>
        </TouchableHighlight>
      )}
    </View>
  );
};

const BACKPLATE_SIZE = DimensionHelper.wp("10%");

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: DimensionHelper.wp("5%")
  },
  backplate: {
    width: BACKPLATE_SIZE,
    height: BACKPLATE_SIZE,
    borderRadius: BACKPLATE_SIZE / 2,
    backgroundColor: Colors.hoverBackground,
    borderWidth: 1,
    borderColor: Colors.borderAccent,
    alignItems: "center",
    justifyContent: "center"
  },
  message: {
    color: Colors.textSubtle,
    fontSize: DimensionHelper.wp("2%"),
    textAlign: "center",
    marginTop: DimensionHelper.hp("2%")
  },
  subMessage: {
    color: Colors.textDimmed,
    fontSize: DimensionHelper.wp("1.4%"),
    textAlign: "center",
    marginTop: DimensionHelper.hp("1%")
  }
});
