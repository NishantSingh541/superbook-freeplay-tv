import React, { useEffect, useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "react-i18next";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { Colors } from "../helpers";
import { AccountInfo, AccountInfoHelper } from "../helpers/AccountInfoHelper";
import { getProvider } from "../providers";

type ShowArgs = {
  title?: string;
  onDelete: () => void;
};

let showHandler: ((args: ShowArgs) => void) | null = null;

/**
 * Pop-up shown before deleting a lesson that is currently scheduled (it would just be
 * downloaded again). Group leaders get a QR code to the Course Scheduler; group members
 * are told to contact their group leader.
 *
 * Usage:  if (ScheduledLessonDialog.show({ title, onDelete })) return;
 * show() returns false if the dialog host isn't mounted, so callers can fall back.
 */
export const ScheduledLessonDialog = {
  show(args: ShowArgs): boolean {
    if (!showHandler) return false;
    showHandler(args);
    return true;
  }
};

/** "https://site/wp-json/superbook/v1" -> "https://site/course-scheduler/" (dev or live, automatically). */
const getSchedulerUrl = (): string | null => {
  const apiBase: string | undefined = (getProvider("cbn") as any)?.config?.apiBase;
  if (!apiBase) return null;
  const site = apiBase.split("/wp-json")[0].replace(/\/+$/, "");
  return site ? `${site}/course-scheduler/` : null;
};

const RED = "#ef4444";

type ButtonProps = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  preferred?: boolean;
  testID?: string;
};

const DialogButton = ({ label, onPress, destructive, preferred, testID }: ButtonProps) => {
  const [focused, setFocused] = useState(false);
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        marginLeft: DimensionHelper.wp("1%"),
        paddingVertical: DimensionHelper.hp("1.4%"),
        paddingHorizontal: DimensionHelper.wp("2%"),
        borderRadius: 999,
        borderWidth: 2,
        borderColor: focused ? (destructive ? RED : "#FFFFFF") : "rgba(255,255,255,0.25)",
        backgroundColor: focused ? (destructive ? RED : "#FFFFFF") : "transparent",
        transform: [{ scale: focused ? 1.06 : 1 }]
      }}>
      <Text
        style={{
          fontSize: DimensionHelper.wp("1.3%"),
          fontWeight: "700",
          color: focused ? (destructive ? "#FFFFFF" : "#0f141e") : destructive ? "#ff8a8a" : "#FFFFFF"
        }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

/** Mount once (NavWrapper). Renders the pop-up when ScheduledLessonDialog.show() is called. */
export const ScheduledLessonDialogHost = () => {
  const { t } = useTranslation();
  const [args, setArgs] = useState<ShowArgs | null>(null);
  const [info, setInfo] = useState<AccountInfo | null>(AccountInfoHelper.cached);

  useEffect(() => {
    showHandler = (a: ShowArgs) => {
      setArgs(a);
      AccountInfoHelper.loadCached().then(cached => { if (cached) setInfo(cached); });
    };
    return () => { showHandler = null; };
  }, []);

  if (!args) return null;

  const close = () => setArgs(null);
  const confirm = () => {
    const a = args;
    setArgs(null);
    a.onDelete();
  };

  const c: any = Colors;
  const panel = c.surface ?? c.backgroundCard ?? "#151c28";
  const textPrimary = c.textPrimary ?? "#FFFFFF";
  const textSecondary = c.textSecondary ?? "#94a3b8";
  const accent = c.primary ?? RED;

  const isMember = info?.account_type === "member";
  const schedulerUrl = getSchedulerUrl();
  const qrSize = DimensionHelper.hp("24%");

  const body = isMember
    ? (info?.managed_by
      ? t("downloads.scheduledMemberBodyNamed",
        "This lesson was scheduled by your group leader, {{name}}, so the app will download it again automatically. To change it, please contact your group leader.",
        { name: info.managed_by })
      : t("downloads.scheduledMemberBody",
        "This lesson was scheduled by your group leader, so the app will download it again automatically. To change it, please contact your group leader."))
    : t("downloads.scheduledLeaderBody",
      "This lesson is on your group's schedule, so the app will download it again automatically. To change or remove it, update your schedule in the Course Scheduler.");

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center" }}>
        <View
          testID="scheduled-lesson-dialog"
          style={{
            width: DimensionHelper.wp(isMember || !schedulerUrl ? "50%" : "62%"),
            backgroundColor: panel,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: accent,
            padding: DimensionHelper.wp("2%")
          }}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, paddingRight: isMember || !schedulerUrl ? 0 : DimensionHelper.wp("2%") }}>
              <Text style={{ color: textPrimary, fontSize: DimensionHelper.wp("1.9%"), fontWeight: "700" }}>
                {t("downloads.scheduledDeleteTitle", "This lesson is currently scheduled")}
              </Text>
              {!!args.title && (
                <Text style={{ color: accent, fontSize: DimensionHelper.wp("1.3%"), fontWeight: "600", marginTop: DimensionHelper.hp("0.6%") }} numberOfLines={1}>
                  {args.title}
                </Text>
              )}
              <Text style={{ color: textPrimary, fontSize: DimensionHelper.wp("1.3%"), lineHeight: DimensionHelper.wp("1.9%"), marginTop: DimensionHelper.hp("1.5%") }}>
                {body}
              </Text>
              {!isMember && !!schedulerUrl && (
                <Text style={{ color: textSecondary, fontSize: DimensionHelper.wp("1.15%"), marginTop: DimensionHelper.hp("1.5%") }}>
                  {schedulerUrl.replace(/^https?:\/\//, "")}
                </Text>
              )}
              <Text style={{ color: textSecondary, fontSize: DimensionHelper.wp("1.05%"), marginTop: DimensionHelper.hp("1.5%") }}>
                {t("downloads.scheduledAutoTip", "To stop automatic downloads on this TV, turn off Auto-Download Today's Lesson in Account.")}
              </Text>
            </View>

            {!isMember && !!schedulerUrl && (
              <View style={{ alignItems: "center" }}>
                <View style={{ padding: DimensionHelper.wp("0.6%"), backgroundColor: "#FFFFFF", borderRadius: 10 }}>
                  <QRCode value={schedulerUrl} size={qrSize} />
                </View>
                <Text style={{ color: textSecondary, fontSize: DimensionHelper.wp("1%"), marginTop: DimensionHelper.hp("1%"), textAlign: "center", width: qrSize }}>
                  {t("downloads.scheduledScan", "Scan with your phone to open the Course Scheduler")}
                </Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: DimensionHelper.hp("2.5%") }}>
            <DialogButton
              testID="scheduled-dialog-cancel"
              label={t("downloads.scheduledCancel", "Cancel")}
              onPress={close}
              preferred
            />
            <DialogButton
              testID="scheduled-dialog-delete"
              label={t("downloads.scheduledDeleteAnyway", "Delete anyway")}
              onPress={confirm}
              destructive
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};
