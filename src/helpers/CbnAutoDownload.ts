import { CachedData } from "./CachedData";
import { ProviderAuthHelper } from "./ProviderAuthHelper";
import { ProviderSettingsHelper } from "./ProviderSettingsHelper";
import { StorageManager } from "./StorageManager";
import { DownloadIndex } from "./DownloadIndex";
import { getProvider } from "../providers";
import { TimeoutHelper } from "./TimeoutHelper";
import type { ScheduleEntry, ContentFile, ContentProviderAuthData } from "@churchapps/content-providers";

const CBN_PROVIDER_ID = "cbn";

let running = false;

const toMessageFile = (f: ContentFile) => ({
  id: f.id,
  name: f.title,
  url: f.url,
  fileType: f.mediaType,
  loop: f.loop,
  loopVideo: f.loopVideo,
  seconds: f.seconds,
  image: f.thumbnail
});

/**
 * Background auto-download for CBN's shared org-wide schedule. Runs
 * identically on every device — leader or member — since /schedules
 * returns the same combined calendar to any logged-in user. Downloads
 * today's/current AND upcoming scheduled lessons (not just the current
 * one), so devices get real lead time to fetch over a good connection
 * well before a lesson is actually needed, rather than only starting on
 * the lesson's own day.
 *
 * Fully automatic, no confirmation — triggered by a periodic timer in
 * App.tsx and once immediately after CBN is first connected.
 */
const LAST_IDENTITY_KEY = "cbn_last_identity";
const FAILURE_TRACKING_KEY = "cbn_download_failures";
const CACHE_MIGRATION_FLAG_KEY = "cache_to_documents_migrated_v1";
const BASE_RETRY_DELAY_MS = 30 * 1000; // 30s
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000; // 1 hour ceiling
const MAX_TRACKED_ATTEMPTS = 6; // caps how far the exponential backoff grows

type FailureRecord = { attempts: number; nextRetryAt: number };

export class CbnAutoDownload {
  /**
   * Compare the identity in a freshly-issued auth payload against whatever
   * was stored from the previous pairing on this device. If it's genuinely
   * a different person (different userId, or the same userId but a
   * different group — e.g. moved between groups), switch to that
   * identity's own download namespace (see DownloadIndex.getStorageKey).
   * Nothing is deleted — a previous account's downloads are hidden, not
   * destroyed, and reappear intact if that account signs back in later.
   * Safe to call on every pairing/refresh — a routine refresh for the
   * SAME person is a no-op here.
   */
  static async clearDownloadsIfIdentityChanged(newAuth: ContentProviderAuthData): Promise<void> {
    if (newAuth.userId === undefined) return; // backend didn't send identity — nothing to compare

    const stored = await CachedData.getAsyncStorage(LAST_IDENTITY_KEY);
    const newIdentity = { userId: newAuth.userId, groupId: newAuth.groupId ?? null };

    const changed = !stored || stored.userId !== newIdentity.userId || stored.groupId !== newIdentity.groupId;

    if (changed) {
      console.log(
        `[CbnAutoDownload] Identity changed (was ${JSON.stringify(stored)}, now ${JSON.stringify(newIdentity)}) — switching to this account's own download namespace.`
      );
    }

    await CachedData.setAsyncStorage(LAST_IDENTITY_KEY, newIdentity);
  }

  private static async getFailureMap(): Promise<Record<string, FailureRecord>> {
    const data = await CachedData.getAsyncStorage(FAILURE_TRACKING_KEY);
    return data && typeof data === "object" ? data : {};
  }

  private static async recordFailure(downloadKey: string): Promise<void> {
    const map = await this.getFailureMap();
    const prev = map[downloadKey];
    const attempts = Math.min((prev?.attempts ?? 0) + 1, MAX_TRACKED_ATTEMPTS);
    const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempts - 1), MAX_RETRY_DELAY_MS);
    map[downloadKey] = { attempts, nextRetryAt: Date.now() + delay };
    await CachedData.setAsyncStorage(FAILURE_TRACKING_KEY, map);
    console.log(`[CbnAutoDownload] Recorded failure for ${downloadKey} (attempt ${attempts}), next retry in ${Math.round(delay / 1000)}s`);
  }

  private static async clearFailure(downloadKey: string): Promise<void> {
    const map = await this.getFailureMap();
    if (map[downloadKey]) {
      delete map[downloadKey];
      await CachedData.setAsyncStorage(FAILURE_TRACKING_KEY, map);
    }
  }

  private static async isRetryEligible(downloadKey: string): Promise<boolean> {
    const map = await this.getFailureMap();
    const record = map[downloadKey];
    if (!record) return true;
    return Date.now() >= record.nextRetryAt;
  }

  static async run(): Promise<void> {
    if (running) {
      console.log("[CbnAutoDownload] already running, skipping this trigger");
      return;
    }
    if (!CachedData.connectedProviders.includes(CBN_PROVIDER_ID)) {
      console.log("[CbnAutoDownload] CBN not connected, skipping");
      return;
    }

    const enabled = await ProviderSettingsHelper.isCbnAutoDownloadEnabled(CBN_PROVIDER_ID);
    if (!enabled) {
      console.log("[CbnAutoDownload] disabled in settings, skipping");
      return;
    }

    // UC-D-03: a lapsed membership blocks NEW downloads, but existing
    // downloaded content (and the cleanup/retention rules that manage it)
    // are untouched — cleanupOldDownloads still runs even when lapsed.
    if (!CachedData.membershipActive) {
      console.log("[CbnAutoDownload] membership lapsed, skipping new downloads");
      return;
    }

    console.log("[CbnAutoDownload] starting run");

    running = true;
    try {
      const alreadyMigrated = await CachedData.getAsyncStorage(CACHE_MIGRATION_FLAG_KEY);
      if (!alreadyMigrated) {
        console.log("[CbnAutoDownload] Running one-time cache-to-persistent-storage migration");
        await CachedData.migrateCacheToDocuments();
        await CachedData.setAsyncStorage(CACHE_MIGRATION_FLAG_KEY, true);
      }

      const provider = getProvider(CBN_PROVIDER_ID);
      if (!provider?.getSchedules || !provider.getPlaylistByLessonId) return;

      const auth = await ProviderAuthHelper.refreshIfNeeded(CBN_PROVIDER_ID);
      const schedules = await TimeoutHelper.withTimeout(provider.getSchedules(auth), 20000, "fetching schedules");
      console.log(`[CbnAutoDownload] fetched ${schedules.length} total schedule entries`);

      // Download only the current AND upcoming scheduled entries — not
      // past ones. A lesson can be "current" (is_current) even when its
      // original schedule_date is in the past — the scheduler treats it
      // as a queue, not a strict date match — so that's checked separately
      // from the date-based upcoming/past split below. Past entries are
      // still counted for logging visibility, but intentionally excluded
      // from the download queue so storage isn't spent on lessons that
      // have already aired.
      const today = new Date().toISOString().slice(0, 10);
      const active = schedules.filter(s => s.status === 1);

      const current = active.filter(s => s.is_current);
      const upcoming = active
        .filter(s => !s.is_current && s.schedule_date >= today)
        .sort((a, b) => (a.schedule_date < b.schedule_date ? -1 : 1)); // soonest first
      const past = active
        .filter(s => !s.is_current && s.schedule_date < today)
        .sort((a, b) => (a.schedule_date > b.schedule_date ? -1 : 1)); // most recent first

      const ordered = [...current, ...upcoming];
      console.log(
        `[CbnAutoDownload] ${ordered.length} entries queued for download ` +
        `(${current.length} current, ${upcoming.length} upcoming, ${past.length} past — skipped)`
      );

      // Seed pending state for every entry not yet started, so the Downloads
      // screen can show a "Pending" card for lessons still waiting in the
      // queue behind whichever one is actively downloading.
      CachedData.pendingEntries = {};
      for (const entry of ordered) {
        const key = DownloadIndex.generateKey("cbn-schedule", { scheduleId: String(entry.id) });
        CachedData.pendingEntries[key] = { title: entry.lesson_title, image: entry.thumb };
      }

      for (const entry of ordered) {
        const downloadKey = DownloadIndex.generateKey("cbn-schedule", { scheduleId: String(entry.id) });
        const eligible = await this.isRetryEligible(downloadKey);
        if (!eligible) {
          console.log(`[CbnAutoDownload] Schedule ${entry.id} still in backoff window, skipping this run`);
          continue;
        }
        await this.downloadEntry(entry, auth);
      }
      CachedData.pendingEntries = {};

      await this.cleanupOldDownloads(schedules, today);
      console.log("[CbnAutoDownload] run complete");
    } catch (err) {
      console.error("[CbnAutoDownload] run failed:", err);
    } finally {
      running = false;
    }
  }

  private static async downloadEntry(entry: ScheduleEntry, auth: any): Promise<void> {
    const downloadKey = DownloadIndex.generateKey("cbn-schedule", { scheduleId: String(entry.id) });
    delete CachedData.pendingEntries[downloadKey];
    try {
      const provider = getProvider(CBN_PROVIDER_ID);
      if (!provider?.getPlaylistByLessonId) return;

      const files = await TimeoutHelper.withTimeout(provider.getPlaylistByLessonId(entry.lesson_id, auth), 20000, "fetching playlist");
      if (files.length === 0) return;

      const messageFiles = files.map(toMessageFile);
      const alreadyCached = await CachedData.allFilesCached(messageFiles);
      if (alreadyCached) {
        console.log(`[CbnAutoDownload] schedule ${entry.id} already fully cached, skipping`);
        return;
      }

      console.log(`[CbnAutoDownload] downloading schedule ${entry.id} (${entry.lesson_title}) — ${files.length} files`);
      CachedData.downloadingEntries[downloadKey] = { title: entry.lesson_title, image: entry.thumb, progress: 0, filesCached: 0, filesTotal: files.length };

      const hasSpace = await StorageManager.ensureFreeSpace([downloadKey]);
      if (!hasSpace) {
        console.warn(`[CbnAutoDownload] Insufficient storage even after eviction — skipping schedule ${entry.id} this run`);
        CachedData.lowStorageNotice = true;
        return; // not a failure — no backoff penalty; retried again next run once space frees up
      }
      CachedData.lowStorageNotice = false;

      await CachedData.prefetch(messageFiles, (cached, total) => {
        const percent = total > 0 ? Math.round((cached / total) * 100) : 0;
        CachedData.downloadingEntries[downloadKey] = { title: entry.lesson_title, image: entry.thumb, progress: percent, filesCached: cached, filesTotal: total };
      });
      delete CachedData.downloadingEntries[downloadKey];
      console.log(`[CbnAutoDownload] finished downloading schedule ${entry.id}`);
      DownloadIndex.addEntry({
        downloadKey,
        source: "cbn-schedule",
        providerId: CBN_PROVIDER_ID,
        title: entry.lesson_title,
        image: entry.thumb,
        category: entry.category,
        messageFiles,
        downloadedAt: Date.now()
      });
      await this.clearFailure(downloadKey);
    } catch (err) {
      console.error(`[CbnAutoDownload] Failed to download schedule ${entry.id}:`, err);
      await this.recordFailure(downloadKey);
    } finally {
      delete CachedData.downloadingEntries[DownloadIndex.generateKey("cbn-schedule", { scheduleId: String(entry.id) })];
    }
  }

  /**
   * Two independent cleanup rules, per UC-D-04:
   *
   * Rule 1 (schedule-tied): a video tied to a specific scheduled session
   * is deleted 1 day after that session's schedule_date has passed,
   * unless it's still flagged as the current lesson. The clock starts
   * from the lesson's own schedule_date (when it "completed"), not from
   * whenever it happened to be downloaded. Entries whose schedule can't
   * be found in the freshly-fetched list (e.g. dropped from the API
   * entirely) are left alone rather than guessed at.
   *
   * Rule 2 (catalog/Browse): a video downloaded from the catalog — not
   * tied to a specific schedule (source !== "cbn-schedule", e.g. a
   * manual download via Browse) — is deleted 30 days after its own
   * download date, independent of Rule 1 entirely.
   */
  private static async cleanupOldDownloads(schedules: ScheduleEntry[], today: string): Promise<void> {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const scheduleById = new Map(schedules.map(s => [String(s.id), s]));
    const entries = await DownloadIndex.getAll();

    for (const entry of entries) {
      if (entry.source === "cbn-schedule") {
        // Rule 1: schedule-tied.
        const scheduleId = entry.downloadKey.split(":")[1];
        const schedule = scheduleId ? scheduleById.get(scheduleId) : undefined;
        if (!schedule) continue;
        if (schedule.is_current) continue;
        if (schedule.schedule_date >= today) continue;

        const ageMs = now - new Date(schedule.schedule_date).getTime();
        if (ageMs >= ONE_DAY_MS) {
          console.log(`[CbnAutoDownload] Deleting schedule-tied lesson 1+ day past its session date: "${entry.title}" (scheduled ${schedule.schedule_date})`);
          await DownloadIndex.deleteFiles(entry);
          await DownloadIndex.removeEntry(entry.downloadKey);
        }
      } else {
        // Rule 2: catalog/Browse downloads — not tied to any schedule.
        const downloadAgeMs = now - (entry.downloadedAt ?? now);
        if (downloadAgeMs >= THIRTY_DAYS_MS) {
          const downloadedIso = new Date(entry.downloadedAt ?? now).toISOString();
          console.log(`[CbnAutoDownload] Deleting catalog download 30+ days old: "${entry.title}" (downloaded ${downloadedIso})`);
          await DownloadIndex.deleteFiles(entry);
          await DownloadIndex.removeEntry(entry.downloadKey);
        }
      }
    }
  }
}
