import { Menu, shell } from "electron";
import settings from "electron-settings";

export const initMenu = (
  downloadKeyboardDefinitions: (force: boolean) => Promise<void>,
  settingChanged: (name: string) => Promise<void>,
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
          click: async () => {
            await downloadKeyboardDefinitions(true);
          },
        },
        {
          label: "Only use local definitions",
          checked: !!settings.getSync("onlyLocalDefinitions"),
          click: async () => {
            await settings.set(
              "onlyLocalDefinitions",
              !(await settings.get("onlyLocalDefinitions")),
            );

            settingChanged("onlyLocalDefinitions");
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
