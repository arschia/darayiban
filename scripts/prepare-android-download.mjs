import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

// Pin the signed release: a failed download must never publish an older APK.
const releaseUrl = "https://github.com/arschia/darayiban/releases/download/android-v1.1.1/darayiban-android.apk";
const expectedSha256 = "27b4ddd96e07a361feb5d699c8e4f7caf2ee1536d4846c66c975078b6035da69";
const expectedSize = 6306844;
const directory = new URL("../public/downloads/", import.meta.url);
const destination = new URL("darayiban-android.apk", directory);

function verified(bytes) {
  return bytes.length === expectedSize
    && createHash("sha256").update(bytes).digest("hex") === expectedSha256;
}

let bytes;
try {
  bytes = await readFile(destination);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (!bytes || !verified(bytes)) {
  const response = await fetch(releaseUrl, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Android release download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (!verified(bytes)) throw new Error("Android release size or SHA-256 does not match the pinned APK.");

  await mkdir(directory, { recursive: true });
  const temporary = new URL("darayiban-android.apk.tmp", directory);
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
}

await writeFile(new URL("darayiban-android.apk.sha256", directory), `${expectedSha256}  darayiban-android.apk\n`);
console.log(`Verified Android 1.1.1 download: ${bytes.length} bytes (${expectedSha256}).`);
