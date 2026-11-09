import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("viaDesktop", {
  connect: () => ipcRenderer.invoke("via-desktop:connect"),
  loadAndConnect: (text: string) =>
    ipcRenderer.invoke("via-desktop:connect", text),
});
