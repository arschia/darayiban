import { Capacitor, registerPlugin } from "@capacitor/core";

export type AndroidSmsStatus = {
  supported: boolean;
  configured: boolean;
  permission: "granted" | "denied" | "prompt" | "prompt-with-rationale";
  tokenId?: string | null;
  userId?: string | null;
  lastReceivedAt?: number;
  lastUploadedAt?: number;
  lastResult?: string | null;
  pendingCount?: number;
  failedCount?: number;
};

type SmsBridgePlugin = {
  getStatus(): Promise<AndroidSmsStatus>;
  requestPermission(): Promise<AndroidSmsStatus>;
  configure(options: { token: string; endpoint: string; tokenId: string; userId: string }): Promise<AndroidSmsStatus>;
  checkConnection(): Promise<{ connected: boolean }>;
  disable(): Promise<AndroidSmsStatus>;
};

export const SmsBridge = registerPlugin<SmsBridgePlugin>("SmsBridge");

export function isNativeAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
