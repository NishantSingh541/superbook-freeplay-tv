import { useTranslation } from "react-i18next";
import { Styles, Colors, Typography } from "../helpers";
import { View, Text, TouchableOpacity } from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

type Props = {
  headerText: string;
  showBackbutton?: boolean;
  onpress?: () => void;
  noBorder?: boolean;
  badgeText?: string;
  dateText?: string;
};

export const MenuHeader = (props: Props) => {
  const { t } = useTranslation();
  return (
    <View style={props.noBorder ? { ...Styles.menuHeader, borderBottomWidth: 0 } : Styles.menuHeader}>
      {props.showBackbutton && (
        <TouchableOpacity
          onPress={props.onpress}
          accessibilityLabel={t("menu.back")}
          style={{ paddingRight: 16 }}>
          <View
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 20,
              backgroundColor: Colors.focusBackground
            }}>
            <MaterialIcons
              name={"keyboard-arrow-left"}
              color={Colors.textPrimary}
              size={28}
            />
          </View>
        </TouchableOpacity>
      )}

      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ ...Styles.H2, fontSize: Typography.heading3, flexShrink: 1, marginRight: 12, color: Colors.textPrimary }}>
        {props.headerText}
      </Text>
      {props.badgeText && (
        <View
          style={{
            backgroundColor: Colors.primary,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 4
          }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
            {props.badgeText}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }} />
      {props.dateText && (
        <Text style={{ color: Colors.textSubtle, fontSize: 13, marginLeft: 16 }}>
          {props.dateText}
        </Text>
      )}
    </View>
  );
};
