import {
  getSelectedProviderType,
  hasExistingData,
  activateProvider,
  setSelectedProviderType,
} from "./services/providers";
import { clearConfig as clearLastfmConfig } from "./services/lastfm";
import { getLogs, getLastError, log } from "./services/logger";
import { getTrackingStatus, initPoller } from "./services/tracker";
import { runTrackingTest, startupIntegrityCheck } from "./services/storage";
import { setTrackingHealthy } from "./services/tracker";


(window as any).ListeningStats = {
  resetLastfmKey: () => {
    clearLastfmConfig();
    log("Last.fm API key cleared. Reload the app to reconfigure.");
  },
  getTrackingStatus,
  getLastError,
  getLogs,
  testWrite: async () => {
    const result = await runTrackingTest();
    console.log("[ListeningStats] testWrite result:", result);
    return result;
  },
};

async function main(): Promise<void> {
  // Always start local tracking from the extension — it persists across provider switches
  initPoller("local");
  startupIntegrityCheck().then((result) => {
    if (!result.ok) {
      setTrackingHealthy(false, result.error);
      console.warn("[listening-stats] Startup integrity check failed:", result.error);
      Spicetify?.showNotification?.(
        "Tracking database issue detected \u2014 try restarting Spotify",
        true,
      );
    }
  });

  let providerType = getSelectedProviderType();

  if (!providerType && hasExistingData()) {
    providerType = "local";
    setSelectedProviderType("local");
  }

  if (providerType) {
    activateProvider(providerType);
  }

}

(function init(retries = 0) {
  if (!Spicetify.Player || !Spicetify.Platform || !Spicetify.CosmosAsync) {
    if (retries >= 50) {
      console.error("[listening-stats] Spicetify not ready after 5s, giving up");
      Spicetify?.showNotification?.("Listening Stats failed to initialize — try restarting Spotify", true);
      return;
    }
    setTimeout(() => init(retries + 1), 100);
    return;
  }
  main();
})();
