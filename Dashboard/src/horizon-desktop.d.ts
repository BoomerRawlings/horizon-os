type HorizonVaultStatus = {
  exists: boolean;
  hasObsidianConfig: boolean;
  initialized: boolean;
  missingHorizon: string[];
  missingRequired: string[];
  missingWorkspace: string[];
  path: string;
  ready: boolean;
};

type HorizonVaultSelectionResult = {
  canceled: boolean;
  ok: boolean;
  restarting: boolean;
  vaultPath: string;
};

interface Window {
  horizonDesktop?: {
    chooseVault: () => Promise<HorizonVaultSelectionResult>;
    getVaultStatus: () => Promise<{
      configStored: boolean;
      ok: boolean;
      status: HorizonVaultStatus;
      vaultPath: string;
    }>;
  };
}
