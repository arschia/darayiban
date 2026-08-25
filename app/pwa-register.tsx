"use client";

import { useEffect } from "react";

type InstallPromptWindow = Window & {
  __darayibanInstallPrompt?: Event;
};

export function PwaRegister() {
  useEffect(() => {
    const installWindow = window as InstallPromptWindow;
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      installWindow.__darayibanInstallPrompt = event;
      window.dispatchEvent(new CustomEvent("darayiban-install-ready"));
    };
    const onInstalled = () => {
      delete installWindow.__darayibanInstallPrompt;
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
