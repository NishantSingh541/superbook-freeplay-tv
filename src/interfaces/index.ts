export type { MessageFileInterface } from "@churchapps/content-providers";
import type { MessageFileInterface } from "@churchapps/content-providers";

export interface DeviceInterface {
  id?: string;
  deviceId?: string;
  churchId?: string;
  contentType?: string;
  contentId?: string;
  pairingCode?: string;
}

export interface DownloadedItemInterface {
  downloadKey: string;
  source: "provider" | "plan" | "cbn-schedule";
  providerId?: string;
  title?: string;
  description?: string;
  image?: string;
  category?: number | null;
  /** Date the lesson is scheduled for (YYYY-MM-DD). Missing for downloads not tied to a schedule. */
  scheduledDate?: string;
  messageFiles: MessageFileInterface[];
  downloadedAt: number;
  lastAccessedAt?: number;
}

export * from "./ContentProviderInterfaces";
