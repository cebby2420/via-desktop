import { Menu, shell } from "electron";
import settings from "electron-settings";

export const initMenu = (
  downloadKeyboardDefinitions: () => Promise<void>,
  localDefinitionsChanged: () => Promise<void>,
  connectKeyboard: () => Promise<void>,
) => {
  const menu = Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Settings",
      submenu: [
        {
          label: "Connect VIA keyboard…",
          click: connectKeyboard,
        },
        {
          label: "Force download definitions",
          click: downloadKeyboardDefinitions,
        },
        {
          label: "Only use local definitions",
          type: "checkbox",
          checked: !!settings.getSync("onlyLocalDefinitions"),
          click: async () => {
            await settings.set(
              "onlyLocalDefinitions",
              !(await settings.get("onlyLocalDefinitions")),
            );

            await localDefinitionsChanged();
          },
        },
        {
          label: "Allow connecting to unknown devices",
          checked: !!settings.getSync("allowUnknownDevices"),
          type: "checkbox",
          click: async () => {
            await settings.set(
              "allowUnknownDevices",
              !(await settings.get("allowUnknownDevices")),
            );
          },
        },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Learn More",
          click: async () => {
            await shell.openExternal(
              "https://github.com/cebby2420/via-desktop",
            );
          },
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
};
