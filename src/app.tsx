import {
  getSelectedProviderType,
  hasExistingData,
  activateProvider,
  setSelectedProviderType,
} from "./services/providers";
import { clearConfig as clearLastfmConfig } from "./services/lastfm";
import { log } from "./services/logger";


(window as any).ListeningStats = {
  resetLastfmKey: () => {
    clearLastfmConfig();
    log("Last.fm API key cleared. Reload the app to reconfigure.");
  },
};

async function main(): Promise<void> {
  let providerType = getSelectedProviderType();

  if (!providerType && hasExistingData()) {
    providerType = "local";
    setSelectedProviderType("local");
  }

  if (providerType) {
    activateProvider(providerType);
  }

}

(function init() {
  if (!Spicetify.Player || !Spicetify.Platform || !Spicetify.CosmosAsync) {
    setTimeout(init, 100);
    return;
  }
  main();
})();
