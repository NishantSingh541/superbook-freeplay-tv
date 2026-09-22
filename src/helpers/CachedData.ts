import AsyncStorage from "@react-native-async-storage/async-storage";
import { MessageFileInterface, CurrentPlan } from "@churchapps/content-providers";

export type ProviderSettings = { libraryEnabled: boolean; cbnAutoDownloadEnabled?: boolean };
import RNFS from "react-native-fs";
import * as Sentry from "@sentry/react-native";

export class CachedData {
  static messageFiles: MessageFileInterface[];

  // Plan pairing data
  static providerId: string | null = null;
  static pairingData: unknown = null;
  static currentPlan: CurrentPlan | null = null;

  static totalCachableItems: number = 0;
  static cachedItems: number = 0;
  static cachePath = RNFS.DocumentDirectoryPath;

  // Byte-level progress tracking
  static totalBytes: number = 0;
  static downloadedBytes: number = 0;

  static navExpanded = false;
  static currentScreen = "";
  static preventSidebarExpand = false;
  static resolution: "720" | "1080" = "720";

  // In-progress background downloads (e.g. CbnAutoDownload), keyed by
  // downloadKey. DownloadsScreen polls this to show a live "Downloading..."
  // card with a blurred thumbnail, distinct from DownloadIndex's *completed*
  // entries. Progress is 0-100.
  static downloadingEntries: Record<string, { title: string; image?: string; progress: number; filesCached?: number; filesTotal?: number }> = {};
  static pendingEntries: Record<string, { title: string; image?: string }> = {};
  static lowStorageNotice: boolean = false;
  // UC-D-03: defaults true (active) so a fresh install isn't wrongly
  // blocked before the first real membership check has completed.
  static membershipActive: boolean = true;

  // Content provider state
  static connectedProviders: string[] = [];
  static activeProvider: string | null = null;
  static providerSettings: Record<string, ProviderSettings> = {};

  // Focus memory: stores last focused item index per screen key
  static lastFocusedIndex: { [screenKey: string]: number } = {};

  // Clear focus memory for a specific screen or all screens matching a prefix
  static clearFocusMemory(screenKeyOrPrefix?: string) {
    if (!screenKeyOrPrefix) {
      this.lastFocusedIndex = {};
    } else {
      for (const key of Object.keys(this.lastFocusedIndex)) {
        if (key === screenKeyOrPrefix || key.startsWith(screenKeyOrPrefix + "_")) {
          delete this.lastFocusedIndex[key];
        }
      }
    }
  }

  static async getAsyncStorage(key: string) {
    try {
      const json = await AsyncStorage.getItem(key);
      if (json) return JSON.parse(json);
      return null;
    } catch (error) {
      console.error(`Failed to get AsyncStorage key "${key}":`, error);
      Sentry.addBreadcrumb({
        category: "storage",
        message: `Failed to get AsyncStorage key: ${key}`,
        level: "error"
      });
      return null;
    }
  }

  static async setAsyncStorage(key: string, obj: any) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(obj));
    } catch (error) {
      console.error(`Failed to set AsyncStorage key "${key}":`, error);
      Sentry.addBreadcrumb({
        category: "storage",
        message: `Failed to set AsyncStorage key: ${key}`,
        level: "error"
      });
    }
  }

  static async prefetch(
    files: MessageFileInterface[],
    changeCallback: (cached: number, total: number) => void,
    fileProgressCallback?: (progress: number) => void
  ) {
    this.cachedItems = 0;
    this.downloadedBytes = 0;
    this.totalBytes = 0;
    let i = 0;
    this.totalCachableItems = files.length;
    changeCallback(this.cachedItems, this.totalCachableItems);

    for (const f of files) {
      try {
        // Reset file progress at start of each file
        if (fileProgressCallback) fileProgressCallback(0);

        // Skip files with invalid URLs
        if (!f.url || f.url.trim() === "") {
          console.log("Skipping file with empty URL");
          i++;
          this.cachedItems = i;
          changeCallback(this.cachedItems, this.totalCachableItems);
          continue;
        }
        await this.load(f, fileProgressCallback);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.log("Download Failed: " + errorMessage);

        // Only log non-abort errors to Sentry (aborts are expected during navigation)
        if (!errorMessage.includes("abort") && !errorMessage.includes("cancelled")) {
          Sentry.addBreadcrumb({
            category: "download",
            message: `Download failed for ${f.url}: ${errorMessage}`,
            level: "warning"
          });
        }
      }
      i++;
      this.cachedItems = i;
      changeCallback(this.cachedItems, this.totalCachableItems);
    }
  }

  static getFilePath(url: string) {
    if (!url) return "";
    const parts = url.split("?")[0].split("/");
    parts.splice(0, 3);
    // Persistent app storage — NOT the cache directory. Android is free to
    // silently wipe cache-directory files under storage pressure with no
    // warning, which would mean a user's offline-downloaded lesson could
    // vanish without anyone knowing until they tried to play it. Downloaded
    // videos are meant to be reliably available offline, so they live here
    // instead. See CachedData.migrateCacheToDocuments() for the one-time
    // migration of anything downloaded before this change.
    let fullPath = RNFS.DocumentDirectoryPath + "/" + parts.join("/");
    // External video URLs from lessons.church have no file extension (e.g. /externalVideos/download/9DgTnt_fXPu).
    // iOS AVFoundation needs a file extension to detect the media format, so append .mp4.
    const lastSegment = parts[parts.length - 1] || "";
    if (url.includes("externalVideos") && !/\.(mp4|mov|webm|m4v)$/i.test(lastSegment)) {
      fullPath += ".mp4";
    }
    return fullPath;
  }

  /**
   * One-time migration for devices that downloaded videos before storage
   * moved from the cache directory to persistent document storage. Scans
   * every account's download index (they're namespaced per-identity — see
   * DownloadIndex.getStorageKey), and moves any file still sitting at its
   * old cache-directory location to its new persistent location, so
   * existing downloads survive the update instead of silently
   * disappearing and needing a re-download.
   */
  static async migrateCacheToDocuments(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const downloadIndexKeys = allKeys.filter(k => k.startsWith("downloadIndex_"));

      for (const key of downloadIndexKeys) {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) continue;
        let entries: any[];
        try {
          entries = JSON.parse(raw);
        } catch {
          continue;
        }
        if (!Array.isArray(entries)) continue;

        for (const entry of entries) {
          for (const f of entry.messageFiles || []) {
            if (!f.url) continue;
            const newPath = decodeURIComponent(this.getFilePath(f.url));
            const oldPath = newPath.replace(RNFS.DocumentDirectoryPath, RNFS.CachesDirectoryPath);
            if (oldPath === newPath) continue;

            try {
              const newExists = await RNFS.exists(newPath);
              if (newExists) continue; // already migrated

              const oldExists = await RNFS.exists(oldPath);
              if (!oldExists) continue; // nothing to migrate for this file

              const idx = newPath.lastIndexOf("/");
              const folder = newPath.substring(0, idx);
              if (!(await RNFS.exists(folder))) await RNFS.mkdir(folder);
              await RNFS.moveFile(oldPath, newPath);
              console.log(`[CachedData] Migrated downloaded file to persistent storage: ${newPath}`);
            } catch (fileErr) {
              console.error(`[CachedData] Failed to migrate file ${f.url}:`, fileErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("[CachedData] Cache-to-Documents migration failed:", err);
    }
  }

  static async load(file: MessageFileInterface, fileProgressCallback?: (progress: number) => void) {
    if (!file.url) return;
    let fullPath = this.getFilePath(file.url);
    fullPath = decodeURIComponent(fullPath);
    const exists = await RNFS.exists(fullPath);
    if (!exists) {
      await this.download(file, fullPath, fileProgressCallback);
    }
  }

  private static async download(
    file: MessageFileInterface,
    diskPath: string,
    fileProgressCallback?: (progress: number) => void
  ) {
    if (!file.url) {
      throw new Error("Cannot download file with empty URL");
    }

    const idx = diskPath.lastIndexOf("/");
    const folder = diskPath.substring(0, idx);

    try {
      if (!await RNFS.exists(folder)) await RNFS.mkdir(folder);
    } catch (mkdirError) {
      // Directory might already exist or be created by another download
      console.log("mkdir warning:", mkdirError);
    }

    const downloadResponse = RNFS.downloadFile({
      fromUrl: file.url,
      toFile: diskPath,
      progress: (res) => {
        // Report current file progress as a ratio (0 to 1)
        if (res.contentLength > 0 && fileProgressCallback) {
          fileProgressCallback(res.bytesWritten / res.contentLength);
        }
      },
      progressDivider: 1 // Report progress frequently
    });

    const result = await downloadResponse.promise;
    if (result.statusCode !== 200) {
      throw new Error(`Download failed with status ${result.statusCode}`);
    }
  }

  static async allFilesCached(files: MessageFileInterface[]): Promise<boolean> {
    for (const f of files) {
      if (!f.url || f.url.trim() === "") continue;
      let fullPath = this.getFilePath(f.url);
      fullPath = decodeURIComponent(fullPath);
      if (!await RNFS.exists(fullPath)) return false;
    }
    return true;
  }

}
