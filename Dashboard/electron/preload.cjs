const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("horizonDesktop", {
  chooseVault: () => ipcRenderer.invoke("horizon:choose-vault"),
  getVaultStatus: () => ipcRenderer.invoke("horizon:vault-status"),
});
