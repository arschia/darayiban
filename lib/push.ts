export const VAPID_PUBLIC_KEY = "BNtRVBypiNenwKWAVicxY6ya68WGdoYE1jyvANuoq3EyYjej816vc6aAXNRzyExU-pzmitB0bZyUB0D-LcNk41c";

export function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
