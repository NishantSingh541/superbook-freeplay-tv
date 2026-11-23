import { CachedData } from "./CachedData";
import { ProviderAuthHelper } from "./ProviderAuthHelper";
import { TimeoutHelper } from "./TimeoutHelper";
import { getProvider } from "../providers";

const STORAGE_KEY = "cbn_account_info";

export type AccountInfo = {
  display_name: string;
  email: string;
  plan: string | null;
  valid_until: string | null; // YYYY-MM-DD
  renews_on: string | null;   // YYYY-MM-DD
  account_type: "leader" | "member" | "standalone";
  managed_by: string | null;
};

/**
 * Read-only details of the signed-in account (GET /account-info), shown on the
 * Account screen. The last result is saved on the device so it still shows offline,
 * and is cleared on Disconnect.
 */
export class AccountInfoHelper {
  static cached: AccountInfo | null = null;

  static async loadCached(): Promise<AccountInfo | null> {
    if (!AccountInfoHelper.cached) {
      try {
        const saved = await CachedData.getAsyncStorage(STORAGE_KEY);
        if (saved && typeof saved === "object") AccountInfoHelper.cached = saved as AccountInfo;
      } catch {
        // ignore — nothing saved yet
      }
    }
    return AccountInfoHelper.cached;
  }

  static async refresh(providerId: string = "cbn"): Promise<AccountInfo | null> {
    try {
      // Same server the rest of the app uses (dev now, live site later) — no hard-coded URL.
      const apiBase: string | undefined = (getProvider(providerId) as any)?.config?.apiBase;
      if (!apiBase) return AccountInfoHelper.cached;

      const auth: any = await ProviderAuthHelper.refreshIfNeeded(providerId);
      const token: string | undefined = auth?.access_token ?? auth?.accessToken;
      if (!token) return AccountInfoHelper.cached;

      const url = `${apiBase}/account-info`;
      const get = (u: string, headers: Record<string, string>) =>
        TimeoutHelper.withTimeout(fetch(u, { headers }), 15000, "loading account info");

      let res: any = await get(url, { Accept: "application/json", Authorization: `Bearer ${token}` });
      // Some hosts (WP Engine) can strip the Authorization header — retry with the token as a parameter.
      if (res.status === 401) {
        res = await get(`${url}?token=${encodeURIComponent(token)}`, { Accept: "application/json" });
      }
      if (!res.ok) {
        console.log(`[AccountInfo] HTTP ${res.status}`);
        return AccountInfoHelper.cached;
      }

      const d: any = await res.json();
      const info: AccountInfo = {
        display_name: typeof d?.display_name === "string" ? d.display_name : "",
        email: typeof d?.email === "string" ? d.email : "",
        plan: typeof d?.plan === "string" && d.plan ? d.plan : null,
        valid_until: typeof d?.valid_until === "string" && d.valid_until ? d.valid_until : null,
        renews_on: typeof d?.renews_on === "string" && d.renews_on ? d.renews_on : null,
        account_type: d?.account_type === "leader" || d?.account_type === "member" ? d.account_type : "standalone",
        managed_by: typeof d?.managed_by === "string" && d.managed_by ? d.managed_by : null
      };
      AccountInfoHelper.cached = info;
      await CachedData.setAsyncStorage(STORAGE_KEY, info);
      return info;
    } catch (e) {
      console.log("[AccountInfo] refresh failed:", e);
      return AccountInfoHelper.cached;
    }
  }

  static async clear(): Promise<void> {
    AccountInfoHelper.cached = null;
    try {
      await CachedData.setAsyncStorage(STORAGE_KEY, null);
    } catch {
      // ignore
    }
  }
}
