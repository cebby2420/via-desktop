import {
  app,
  BrowserWindow,
  DevicePermissionHandlerHandlerDetails,
  dialog,
  Event,
  net,
  protocol,
  SelectHidDeviceDetails,
  session,
  utilityProcess,
} from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import process from "process";
import { refreshCatalog } from "./definitions";
import log from "electron-log/main";
import { initMenu } from "./menu";
import settings from "electron-settings";
import { updateElectronApp } from "update-electron-app";

const VIA_BASE_URL = "https://usevia.app/";
const APP_SCHEME = "via-desktop";
const APP_ORIGIN = `${APP_SCHEME}://index.html`;

let serverPort: number;
let serverProcess: ReturnType<typeof utilityProcess.fork>;
const previouslyAllowedDevices = new Set<number>();
let supportedVendorProductIds = new Set<number>();
let catalogRefresh: Promise<boolean> | undefined;
const defsFileDir = path.join(app.getPath("sessionData"), "definitions");

const getVendorProductId = (vendorId: number, productId: number) =>
  vendorId * 65536 + productId;

const getAllowedUnknownDevices = (): Set<number> => {
  const stored = settings.getSync("allowedUnknownDevices");
  return new Set(
    Array.isArray(stored)
      ? stored.filter((id): id is number => typeof id === "number")
      : [],
  );
};

const allowUnknownDevice = (vendorProductId: number) => {
  const allowed = getAllowedUnknownDevices();
  allowed.add(vendorProductId);
  settings.setSync("allowedUnknownDevices", [...allowed]);
};

const run = (args: string[], done: () => void): void => {
  const updateExe = path.resolve(
    path.dirname(process.execPath),
    "..",
    "Update.exe",
  );
  log.info("Spawning `%s` with args `%s`", updateExe, args);

  spawn(updateExe, args, {
    detached: true,
  }).on("close", done);
};

// Handle Squirrel startup events (Windows only)
const handleStartupEvent = () => {
  if (process.platform !== "win32") {
    return false;
  }

  const squirrelCommand = process.argv[1];
  const target = path.basename(process.execPath);
  switch (squirrelCommand) {
    case "--squirrel-install":
      run(["--createShortcut=" + target + ""], app.quit);
      break;
    case "--squirrel-uninstall":
      run(["--removeShortcut=" + target + ""], app.quit);
      break;
    case "--squirrel-obsolete":
      app.quit();
      break;
    case "--squirrel-updated":
      return true;
  }
};

if (handleStartupEvent()) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const startServer = (): Promise<number> => {
  if (serverProcess) {
    serverProcess.kill();
    serverPort = undefined;
  }

  return new Promise((resolve) => {
    serverProcess = utilityProcess.fork(path.join(__dirname, "server.js"), [
      defsFileDir,
      VIA_BASE_URL,
      settings.getSync("onlyLocalDefinitions").toString(),
    ]);

    serverProcess.once(
      "message",
      ({ port, supportedIds }: { port: number; supportedIds: number[] }) => {
        supportedVendorProductIds = new Set(supportedIds);
        serverPort = port;
        resolve(port);
      },
    );
  });
};

const downloadKeyboardDefinitions = (force = false) => {
  if (settings.getSync("onlyLocalDefinitions")) {
    return Promise.resolve(false);
  }
  return (catalogRefresh ??= refreshCatalog(
    defsFileDir,
    VIA_BASE_URL,
    force,
    net.fetch,
  )
    .catch((error) => {
      log.warn(
        "Definition catalog refresh failed; keeping local definitions",
        error,
      );
      return false;
    })
    .finally(() => {
      catalogRefresh = undefined;
    }));
};

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: "VIA",
    height: 800,
    width: 1200,
    minHeight: 768,
    minWidth: 1024,
  });

  // Strip Electron from the User-Agent so VIA shows its built-in Authorize buttons,
  // giving users a real user gesture for WebHID device selection and reconnection.
  mainWindow.webContents.setUserAgent(
    mainWindow.webContents.getUserAgent().replace(/\s*Electron\/\S+/, ""),
  );

  const dismissedDevices = new Set<number>();
  let pickerOpen = false;

  // Register a device permission handler that allows access to the devices registered in the VIA definitions files
  // or previously approved by the user through the unknown-device picker.
  mainWindow.webContents.session.setDevicePermissionHandler(
    (details: DevicePermissionHandlerHandlerDetails) => {
      const vendorProductId = getVendorProductId(
        Number(details.device.vendorId),
        Number(details.device.productId),
      );
      if (previouslyAllowedDevices.has(vendorProductId)) {
        return true;
      }

      if (
        supportedVendorProductIds.has(vendorProductId) ||
        getAllowedUnknownDevices().has(vendorProductId)
      ) {
        log.info(
          "Allowing device",
          vendorProductId,
          "name" in details.device ? details.device.name : "",
        );
        previouslyAllowedDevices.add(vendorProductId);
        return true;
      }

      return false;
    },
  );

  const isAllowedDevice = (vendorProductId: number) =>
    previouslyAllowedDevices.has(vendorProductId) ||
    supportedVendorProductIds.has(vendorProductId) ||
    getAllowedUnknownDevices().has(vendorProductId);

  const selectHidDevice = async (
    event: Event,
    { deviceList }: SelectHidDeviceDetails,
    callback: (deviceId?: string) => void,
  ) => {
    event.preventDefault();
    const candidates = deviceList.filter((device) => {
      const id = getVendorProductId(device.vendorId, device.productId);
      return !isAllowedDevice(id) && !dismissedDevices.has(id);
    });
    if (candidates.length === 0) {
      const allowedDevice = deviceList.find((device) =>
        isAllowedDevice(getVendorProductId(device.vendorId, device.productId)),
      );
      callback(allowedDevice?.deviceId);
      return;
    }
    if (pickerOpen || mainWindow.isDestroyed()) {
      callback();
      return;
    }

    pickerOpen = true;
    try {
      const cancelId = candidates.length;
      const choice = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Unknown USB Keyboard",
        message: "Allow VIA Desktop to access an unknown keyboard?",
        detail:
          "This keyboard is not in VIA's built-in device list. Select a device to allow it, or Cancel to ignore it for this session.",
        buttons: [
          ...candidates.map(
            ({ name, vendorId, productId }) =>
              `${name || "USB keyboard"} (${vendorId.toString(16)}:${productId.toString(16)})`,
          ),
          "Cancel",
        ],
        cancelId,
        defaultId: cancelId,
      });

      const chosen = candidates[choice.response];
      if (chosen) {
        const vendorProductId = getVendorProductId(
          chosen.vendorId,
          chosen.productId,
        );
        log.info("User approved unknown device", vendorProductId, chosen.name);
        allowUnknownDevice(vendorProductId);
        previouslyAllowedDevices.add(vendorProductId);
        callback(chosen.deviceId);
      } else {
        for (const device of candidates) {
          dismissedDevices.add(
            getVendorProductId(device.vendorId, device.productId),
          );
        }
        callback();
      }
    } catch {
      callback();
    } finally {
      pickerOpen = false;
    }
  };

  const windowSession = mainWindow.webContents.session;
  windowSession.on("select-hid-device", selectHidDevice);
  mainWindow.on("closed", () => {
    windowSession.off("select-hid-device", selectHidDevice);
  });

  const reloadDefinitions = async () => {
    await startServer();
    await mainWindow.loadURL(APP_ORIGIN);
  };

  initMenu(
    async () => {
      if (await downloadKeyboardDefinitions(true)) {
        await reloadDefinitions();
      }
    },
    async () => {
      await reloadDefinitions();
      void downloadKeyboardDefinitions();
    },
    async () => {
      await settings.set("allowedUnknownDevices", []);
      previouslyAllowedDevices.clear();
      dismissedDevices.clear();
      await mainWindow.loadURL(APP_ORIGIN);
    },
  );

  await mainWindow.loadURL(APP_ORIGIN);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  protocol.handle(APP_SCHEME, (request) => {
    const baseUrl = `http://localhost:${serverPort}`;
    const url = new URL(baseUrl + request.url.replace(`${APP_ORIGIN}/`, "/"));
    // forward everything as-is, we want to support whatever was originally intended
    return fetch(url, { ...request });
  });

  // Redirect Google Fonts requests to the bundled Fira Sans stylesheet so key legends work offline.
  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: ["https://fonts.googleapis.com/*", "https://fonts.gstatic.com/*"],
    },
    (details, callback) => {
      if (details.url.startsWith("https://fonts.googleapis.com/")) {
        callback({ redirectURL: `${APP_ORIGIN}/desktop-fonts/fonts.css` });
        return;
      }
      callback({ cancel: true });
    },
  );

  // Check if settings exist, if not, create them
  if (!settings.hasSync("onlyLocalDefinitions")) {
    settings.setSync("onlyLocalDefinitions", false);
  }
  if (!settings.hasSync("allowedUnknownDevices")) {
    settings.setSync("allowedUnknownDevices", []);
  }

  await startServer();
  await createWindow();
  void downloadKeyboardDefinitions();

  // Portable Windows packages have no Squirrel installer to run updates.
  if (
    process.platform !== "win32" ||
    fs.existsSync(
      path.resolve(path.dirname(process.execPath), "..", "Update.exe"),
    )
  ) {
    updateElectronApp({
      updateInterval: "1 week",
      logger: log,
    });
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
