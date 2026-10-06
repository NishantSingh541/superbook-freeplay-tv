import RNFS from "react-native-fs";
import { DownloadedItemInterface } from "../interfaces";
import { DownloadIndex } from "./DownloadIndex";
import { TimeoutHelper } from "./TimeoutHelper";

const THUMB_DIR = `${RNFS.DocumentDirectoryPath}/thumbs`;

const hashOf = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
};

/**
 * Thumbnails arrive as remote URLs, so Downloads cards went blank with no
 * internet even though the videos were on the device. This saves a copy of
 * each image into app storage when a download finishes and swaps the
 * entry's images over to those local files.
 */
export class ThumbnailCache {
  static isRemote(url?: string): boolean {
    return !!url && /^https?:\/\//i.test(url);
  }

  /** Returns a file:// URI for the saved copy, or the original URL if it can't be saved (offline, etc.). */
  static async localize(url?: string): Promise<string | undefined> {
    if (!url || !this.isRemote(url)) return url;
    try {
      const clean = url.split("?")[0];
      const ext = (clean.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || "jpg").toLowerCase();
      const dest = `${THUMB_DIR}/${hashOf(clean)}.${ext}`;
      if (await RNFS.exists(dest)) return `file://${dest}`;
      await RNFS.mkdir(THUMB_DIR);
      const tmp = `${dest}.part`;
      const result = await TimeoutHelper.withTimeout(RNFS.downloadFile({ fromUrl: url, toFile: tmp }).promise, 10000, "thumbnail download");
      if (result.statusCode >= 200 && result.statusCode < 300) {
        await RNFS.moveFile(tmp, dest);
        return `file://${dest}`;
      }
      await RNFS.unlink(tmp).catch(() => {});
    } catch (e) {
      // Offline or failed: keep the remote URL; a later run tries again.
    }
    return url;
  }

  static async localizeEntry(entry: DownloadedItemInterface): Promise<DownloadedItemInterface> {
    const image = await this.localize(entry.image);
    const messageFiles = await Promise.all(
      entry.messageFiles.map(async f => ({ ...f, image: await this.localize((f as any).image) } as any))
    );
    return { ...entry, image, messageFiles };
  }

  /** Quietly gives entries saved before this existed their offline copies. Returns true if anything changed. */
  static async backfill(entries: DownloadedItemInterface[]): Promise<boolean> {
    let changed = false;
    for (const e of entries) {
      const needs = this.isRemote(e.image) || e.messageFiles.some(f => this.isRemote((f as any).image));
      if (!needs) continue;
      const updated = await this.localizeEntry(e);
      const different =
        updated.image !== e.image ||
        updated.messageFiles.some((f, i) => (f as any).image !== (e.messageFiles[i] as any).image);
      if (different) {
        await DownloadIndex.addEntry(updated);
        changed = true;
      }
    }
    return changed;
  }
}
