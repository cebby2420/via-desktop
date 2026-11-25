import { Menu, shell } from "electron";
import settings from "electron-settings";

export const initMenu = (
  downloadKeyboardDefinitions: () => Promise<void>,
  localDefinitionsChanged: () => Promise<void>,
  clearAllowedUnknownDevices: () => Promise<void>,
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
          label: "Clear allowed unknown devices",
          click: clearAllowedUnknownDevices,
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
