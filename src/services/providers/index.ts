import { ProviderType } from "../../types/listeningstats";
import type { TrackingProvider } from "./types";
import { createLastfmProvider } from "./lastfm";
import { createLocalProvider } from "./local";
import { createStatsfmProvider } from "./statsfm";
import { LS_KEYS } from "../../constants";

let activeProvider: TrackingProvider | null = null;

export function getSelectedProviderType(): ProviderType | null {
  try {
    const stored = localStorage.getItem(LS_KEYS.PROVIDER);
    if (stored === "local" || stored === "lastfm" || stored === "statsfm") {
      return stored;
    }
  } catch (e) {
    console.warn("[listening-stats] Provider selection read failed", e);
  }
  return null;
}

export function setSelectedProviderType(type: ProviderType): void {
  localStorage.setItem(LS_KEYS.PROVIDER, type);
}

export function hasExistingData(): boolean {
  return localStorage.getItem(LS_KEYS.POLLING_DATA) !== null;
}

export function clearProviderSelection(): void {
  if (activeProvider) {
    activeProvider.destroy();
    activeProvider = null;
  }
  localStorage.removeItem(LS_KEYS.PROVIDER);
}

export function getActiveProvider(): TrackingProvider | null {
  return activeProvider;
}

export function activateProvider(type: ProviderType, skipInit = false): void {
  if (activeProvider) {
    if (!skipInit) activeProvider.destroy();
    activeProvider = null;
  }

  setSelectedProviderType(type);

  switch (type) {
    case "lastfm":
      activeProvider = createLastfmProvider();
      break;
    case "local":
      activeProvider = createLocalProvider();
      break;
    case "statsfm":
      activeProvider = createStatsfmProvider();
      break;
  }

  if (!skipInit) {
    activeProvider.init();
  }
}

export type { TrackingProvider } from "./types";
