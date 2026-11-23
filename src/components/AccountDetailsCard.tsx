import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DimensionHelper } from "../helpers/DimensionHelper";
import { Colors } from "../helpers";
import { decodeEntities, formatLongDate } from "../helpers/TextHelper";
import { AccountInfo, AccountInfoHelper } from "../helpers/AccountInfoHelper";

// The Account screen can be seen by everyone in a classroom. Set to false to show
// the email masked (e.g. j***@gmail.com).
const SHOW_FULL_EMAIL = true;

const GREEN = "#22c55e";
const RED = "#ef4444";

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.charAt(0)}***@${domain}`;
};

const safeDecode = (value?: string | null) => {
  if (!value) return "";
  try {
    return decodeEntities(value);
  } catch {
    return value;
  }
};

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
};

type Props = {
  providerId?: string;
  /** Membership state from the existing daily check (UC-D-03). */
  membershipActive: boolean;
};

/**
 * Account card for the Account screen: who is signed in, their plan, dates, role,
 * and the membership status (Active / Inactive) — all in one read-only, non-focusable card.
 */
export const AccountDetailsCard = ({ providerId = "cbn", membershipActive }: Props) => {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AccountInfo | null>(AccountInfoHelper.cached);

  useEffect(() => {
    let alive = true;
    AccountInfoHelper.loadCached().then(cached => { if (alive && cached) setInfo(cached); });
    AccountInfoHelper.refresh(providerId).then(fresh => { if (alive && fresh) setInfo(fresh); });
    return () => { alive = false; };
  }, [providerId]);

  const c: any = Colors;
  const primary = c.primary ?? RED;
  const textPrimary = c.textPrimary ?? "#FFFFFF";
  const textSecondary = c.textSecondary ?? "#94a3b8";
  const border = c.borderAccent ?? "rgba(255,255,255,0.12)";
  const background = c.surface ?? c.backgroundCard ?? "rgba(255,255,255,0.04)";

  const name = safeDecode(info?.display_name) || t("providerSettings.account.unknownName", "Superbook Academy account");
  const email = info?.email ? (SHOW_FULL_EMAIL ? info.email : maskEmail(info.email)) : "";

  const roleLabel =
    info?.account_type === "leader" ? t("providerSettings.account.roleLeader", "Group Leader")
      : info?.account_type === "member" ? t("providerSettings.account.roleMember", "Group Member")
        : null;

  const details: Array<[string, string]> = [];
  details.push([
    t("providerSettings.account.plan", "Plan"),
    info?.plan ? safeDecode(info.plan) : t("providerSettings.account.noPlan", "No active plan")
  ]);
  if (info?.valid_until) {
    details.push([t("providerSettings.account.validUntil", "Valid until"), formatLongDate(info.valid_until)]);
  } else if (info?.renews_on) {
    details.push([t("providerSettings.account.renewsOn", "Renews on"), formatLongDate(info.renews_on)]);
  }
  if (info?.account_type === "member" && info.managed_by) {
    details.push([t("providerSettings.account.managedBy", "Managed by"), safeDecode(info.managed_by)]);
  }

  const statusColor = membershipActive ? GREEN : RED;
  const statusText = membershipActive
    ? t("providerSettings.account.statusActive", "Active")
    : t("providerSettings.account.statusInactive", "Inactive");

  const avatarSize = DimensionHelper.wp("4.2%");

  return (
    <View
      testID="provider-settings-account-card"
      focusable={false}
      style={{
        marginBottom: DimensionHelper.hp("1.5%"),
        borderRadius: 12,
        borderWidth: 2,
        borderColor: border,
        backgroundColor: background,
        overflow: "hidden"
      }}>
      {/* Header: avatar, name + email, status pill */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: DimensionHelper.hp("2%"),
          paddingHorizontal: DimensionHelper.wp("1.5%")
        }}>
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
            backgroundColor: primary,
            alignItems: "center",
            justifyContent: "center",
            marginRight: DimensionHelper.wp("1.2%")
          }}>
          <Text style={{ color: "#FFFFFF", fontSize: DimensionHelper.wp("1.6%"), fontWeight: "700" }}>
            {initialsOf(name)}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ color: textPrimary, fontSize: DimensionHelper.wp("1.8%"), fontWeight: "600" }} numberOfLines={1}>
              {name}
            </Text>
            {roleLabel && (
              <View
                style={{
                  marginLeft: DimensionHelper.wp("0.8%"),
                  paddingHorizontal: DimensionHelper.wp("0.6%"),
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.08)"
                }}>
                <Text style={{ color: textSecondary, fontSize: DimensionHelper.wp("1%"), fontWeight: "600" }}>
                  {roleLabel.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          {!!email && (
            <Text style={{ color: textSecondary, fontSize: DimensionHelper.wp("1.2%"), marginTop: 2 }} numberOfLines={1}>
              {email}
            </Text>
          )}
        </View>

        <View
          testID={membershipActive ? "account-status-active" : "account-status-inactive"}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: DimensionHelper.wp("1%"),
            paddingVertical: DimensionHelper.hp("0.8%"),
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: statusColor,
            backgroundColor: membershipActive ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)"
          }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor, marginRight: 8 }} />
          <Text style={{ color: statusColor, fontSize: DimensionHelper.wp("1.2%"), fontWeight: "700" }}>
            {statusText}
          </Text>
        </View>
      </View>

      {/* Details: plan, date, managed by */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.08)",
          paddingVertical: DimensionHelper.hp("1.6%"),
          paddingHorizontal: DimensionHelper.wp("1.5%")
        }}>
        {details.map(([label, value]) => (
          <View key={label} style={{ width: "33%", paddingRight: DimensionHelper.wp("1%") }}>
            <Text style={{ color: textSecondary, fontSize: DimensionHelper.wp("0.95%"), fontWeight: "600", letterSpacing: 0.8 }}>
              {label.toUpperCase()}
            </Text>
            <Text style={{ color: textPrimary, fontSize: DimensionHelper.wp("1.3%"), marginTop: 4 }} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};
