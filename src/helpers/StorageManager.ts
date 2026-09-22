import RNFS from "react-native-fs";
import * as Sentry from "@sentry/react-native";
import { DownloadedItemInterface } from "../interfaces";
import { DownloadIndex } from "./DownloadIndex";
import { CachedData } from "./CachedData";

const MB = 1024 * 1024;
const LOW_SPACE_THRESHOLD_BYTES = 500 * MB;
const EVICTION_TARGET_BYTES = 1024 * MB;

export type StorageUsage = {
  totalBytes: number;
  freeBytes: number;
  downloadsBytes: number;
  otherBytes: number;
};

export class StorageManager {
  static async getFreeBytes(): Promise<number> {
    try {
      const info = await RNFS.getFSInfo();
      return info.freeSpace;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
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

  // Evict least-recently-used downloaded items until free space meets the target,
  // or only protected entries remain. Lessons are evicted as atomic units.
  // Returns whether free space is now above the low-space threshold — if
  // eviction still can't clear enough room, the caller should skip the
  // download for this run and surface a low-storage notice, per spec.
  static async ensureFreeSpace(protectedKeys: string[] = []): Promise<boolean> {
    const free = await this.getFreeBytes();
    if (free >= LOW_SPACE_THRESHOLD_BYTES) return true;

    const entries = await DownloadIndex.getAll();
    const protectedSet = new Set(protectedKeys.filter(Boolean));
    const candidates = entries
      .filter(e => !protectedSet.has(e.downloadKey))
      .sort((a, b) => this.accessTime(a) - this.accessTime(b));

    if (candidates.length === 0) {
      Sentry.addBreadcrumb({
        category: "storage",
        message: `Low space (${Math.round(free / MB)} MB free) but no evictable entries`,
        level: "warning"
      });
      return free >= LOW_SPACE_THRESHOLD_BYTES;
    }

    let currentFree = free;
    let removed = 0;
    for (const entry of candidates) {
      if (currentFree >= EVICTION_TARGET_BYTES) break;
      const reclaimed = await DownloadIndex.deleteFiles(entry);
      await DownloadIndex.removeEntry(entry.downloadKey);
      currentFree += reclaimed;
      removed++;
    }

    if (removed > 0) {
      Sentry.addBreadcrumb({
        category: "storage",
        message: `Evicted ${removed} cached items (${Math.round(currentFree / MB)} MB free)`,
        level: "info"
      });
    }

    return currentFree >= LOW_SPACE_THRESHOLD_BYTES;
  }

  private static accessTime(entry: DownloadedItemInterface): number {
    return entry.lastAccessedAt ?? entry.downloadedAt ?? 0;
  }
}
