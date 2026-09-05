import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Downloadable installers belong on the website, not inside another installer.
const output = new URL("../out/", import.meta.url);
await rm(new URL("downloads/", output), { recursive: true, force: true });

async function collect(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(file));
    else if (entry.name.endsWith(".js")) files.push(file);
  }
  return files;
}

const scripts = await collect(fileURLToPath(new URL("_next/static/", output)));
let assistantIncluded = false;
for (const file of scripts) {
  if ((await readFile(file, "utf8")).includes("financial-assistant")) {
    assistantIncluded = true;
    break;
  }
}
if (!assistantIncluded) throw new Error("The Android web bundle is missing the financial assistant.");
console.log("Android bundle includes the financial assistant and excludes downloadable APKs.");
