import RNFS from "react-native-fs";
import * as Sentry from "@sentry/react-native";
import { DownloadIndex } from "./DownloadIndex";
import { CachedData } from "./CachedData";

const MB = 1024 * 1024;

// Storage alert levels (used / total device storage):
//   below 65%  -> no alert
//   65% - 79%  -> orange alert
//   80% +      -> red alert, and new auto-downloads are paused
export const STORAGE_ALERT_RATIO = 0.65;
export const STORAGE_CRITICAL_RATIO = 0.8;

// Nothing is ever auto-deleted. If free space drops below the larger of these,
// new downloads are skipped (not failed) and the red banner explains why.
const MIN_FREE_BYTES = 500 * MB;
const MIN_FREE_RATIO = 0.05;

export type StorageUsage = {
  totalBytes: number;
  freeBytes: number;
  downloadsBytes: number;
  otherBytes: number;
};

export type DeviceSpace = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedRatio: number; // 0..1
};

type Listener = () => void;
const listeners = new Set<Listener>();

export class StorageManager {
  // ---- Change notifications (used by the storage banner on every page) ----

  static subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  /** Call after anything that changes disk usage (download finished, items deleted). */
  static notifyChanged(): void {
    listeners.forEach(l => {
      try { l(); } catch { /* a broken listener must not stop the others */ }
    });
  }

  // ---- Space queries ----

  static async getFreeBytes(): Promise<number> {
    try {
      const info = await RNFS.getFSInfo();
      return info.freeSpace;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  /** Lightweight total/free/used for the whole device (no per-file stat calls). */
  static async getDeviceSpace(): Promise<DeviceSpace | null> {
    try {
      const info = await RNFS.getFSInfo();
      const totalBytes = Number(info.totalSpace) || 0;
      const freeBytes = Number(info.freeSpace) || 0;
      if (totalBytes <= 0) return null;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      return { totalBytes, freeBytes, usedBytes, usedRatio: usedBytes / totalBytes };
    } catch {
      return null;
    }
  }

  /** True once the device is at or above 80% of its total storage. */
  static async isNearlyFull(): Promise<boolean> {
    const space = await this.getDeviceSpace();
    return !!space && space.usedRatio >= STORAGE_CRITICAL_RATIO;
  }

  /**
   * Breaks device storage into: this app's downloaded videos, everything
   * else in use, and free space — for a segmented usage display.
   */
  static async getUsage(): Promise<StorageUsage> {
    let totalBytes = 0;
    let freeBytes = 0;
    try {
      const info = await RNFS.getFSInfo();
      totalBytes = info.totalSpace;
      freeBytes = info.freeSpace;
    } catch {
      // Leave as 0 — caller should treat a 0-total result as "unknown"
    }

    let downloadsBytes = 0;
    try {
      const entries = await DownloadIndex.getAll();
      for (const entry of entries) {
        for (const f of entry.messageFiles) {
          if (!f.url) continue;
          try {
            const fullPath = decodeURIComponent(CachedData.getFilePath(f.url));
            const stat = await RNFS.stat(fullPath);
            downloadsBytes += Number(stat.size) || 0;
          } catch {
            // File missing/unreadable — just doesn't count toward the total
          }
        }
      }
    } catch {
      // Leave downloadsBytes at whatever was accumulated so far
    }

    const otherBytes = Math.max(0, totalBytes - freeBytes - downloadsBytes);
    return { totalBytes, freeBytes, downloadsBytes, otherBytes };
  }

  static async touchEntry(downloadKey: string): Promise<void> {
    const entries = await DownloadIndex.getAll();
    const entry = entries.find(e => e.downloadKey === downloadKey);
    if (!entry) return;
    entry.lastAccessedAt = Date.now();
    await DownloadIndex.replaceAll(entries);
  }

  /**
   * Checks there is room for a new download (UC-D-01). NOTHING is deleted
   * here to make room — downloads are only removed by the user or by the
   * normal UC-D-04 retention rules in CbnAutoDownload.
   *
   * Returns false when free space is below max(500 MB, 5% of total); the
   * caller then skips the download for this run and the red banner tells
   * the user to free up space. The parameter is kept only so existing
   * callers keep compiling; it is no longer used.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async ensureFreeSpace(_protectedKeys: string[] = []): Promise<boolean> {
    const space = await this.getDeviceSpace();
    if (!space) return true; // can't read storage — don't block downloads on an unknown

    // 80%+ used: pause new downloads until the user deletes some. Nothing is auto-deleted.
    if (space.usedRatio >= STORAGE_CRITICAL_RATIO) {
      console.warn(`[StorageManager] Storage ${Math.round(space.usedRatio * 100)}% full — new downloads paused until space is freed`);
      return false;
    }

    const minFree = Math.max(MIN_FREE_BYTES, space.totalBytes * MIN_FREE_RATIO);
    if (space.freeBytes >= minFree) return true;

    console.warn(`[StorageManager] Not enough space for new downloads (${Math.round(space.freeBytes / MB)} MB free) — nothing is auto-deleted`);
    Sentry.addBreadcrumb({
      category: "storage",
      message: `Download skipped: ${Math.round(space.freeBytes / MB)} MB free`,
      level: "warning"
    });
    return false;
  }
}
