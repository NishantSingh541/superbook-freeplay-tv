import { CachedData } from "./CachedData";
import { ProviderAuthHelper } from "./ProviderAuthHelper";

const API_BASE = "https://sbamemberdev.wpenginepowered.com/wp-json/superbook/v1";
const LAST_CHECK_KEY = "cbn_membership_last_check";
const STATUS_KEY = "cbn_membership_active";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * UC-D-03: daily membership/subscription validation. A direct fetch to the
 * backend rather than going through the vendored @churchapps/content-providers
 * package — that package has no membership concept at all, and its internal
 * apiRequest() method is private to the provider class, not something our
 * app code can call. This reuses the same base URL and Bearer-token auth
 * every other endpoint already uses, just without going through the
 * package's abstraction layer.
 */
export class MembershipHelper {
  /**
   * Returns the last-known status synchronously (from memory/storage),
   * without making a network call. Defaults to true (active) so a fresh
   * install — before the first real check has ever completed — doesn't
   * wrongly block a brand-new, presumably-active member.
   */
  static async loadCachedStatus(): Promise<boolean> {
    const stored = await CachedData.getAsyncStorage(STATUS_KEY);
    const active = stored === undefined || stored === null ? true : !!stored;
    CachedData.membershipActive = active;
    return active;
  }

  /**
   * Actually calls the backend. Returns the fresh status on success. On
   * network failure, deliberately does NOT change the cached status —
   * a lapsed connection should never be treated as a lapsed membership.
   */
  static async checkStatus(providerId: string): Promise<boolean | null> {
    try {
      const auth = await ProviderAuthHelper.refreshIfNeeded(providerId);
      if (!auth) return null;

      const response = await fetch(`${API_BASE}/membership-status`, {
        method: "GET",
        headers: {
          Authorization: `${auth.token_type || "Bearer"} ${auth.access_token}`
        }
      });

      if (!response.ok) {
        console.warn(`[MembershipHelper] Status check returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      const active = !!data.active;

      CachedData.membershipActive = active;
      await CachedData.setAsyncStorage(STATUS_KEY, active);
      await CachedData.setAsyncStorage(LAST_CHECK_KEY, Date.now());

      console.log(`[MembershipHelper] Checked — active=${active}`);
      return active;
    } catch (err) {
      console.warn("[MembershipHelper] Check failed, keeping last-known status:", err);
      return null;
    }
  }

  /** Only actually hits the network if the last check was 24+ hours ago. */
  static async checkIfDue(providerId: string): Promise<void> {
    const lastCheck = await CachedData.getAsyncStorage(LAST_CHECK_KEY);
    const dueNow = !lastCheck || (Date.now() - lastCheck) >= CHECK_INTERVAL_MS;
    if (dueNow) {
      await this.checkStatus(providerId);
    }
  }
}
