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
  shell,
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

let serverPort: number | undefined;
let serverProcess: ReturnType<typeof utilityProcess.fork> | undefined;
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
const handleStartupEvent = (): boolean => {
  if (process.platform !== "win32") {
    return false;
  }

  const squirrelCommand = process.argv[1];
  const target = path.basename(process.execPath);
  const quit = () => app.quit();
  switch (squirrelCommand) {
    case "--squirrel-install":
      run(["--createShortcut=" + target + ""], quit);
      return true;
    case "--squirrel-uninstall":
      run(["--removeShortcut=" + target + ""], quit);
      return true;
    case "--squirrel-obsolete":
      app.quit();
      return true;
    case "--squirrel-updated":
      app.quit();
      return true;
    default:
      return false;
  }
};

const isSquirrelStartup = handleStartupEvent();
const hasSingleInstanceLock =
  !isSquirrelStartup && app.requestSingleInstanceLock();
if (!isSquirrelStartup && !hasSingleInstanceLock) {
  app.quit();
} else if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (existingWindow) {
      if (existingWindow.isMinimized()) existingWindow.restore();
      existingWindow.focus();
    }
  });
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

  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, "server.js"), [
      defsFileDir,
      VIA_BASE_URL,
      String(Boolean(settings.getSync("onlyLocalDefinitions"))),
    ]);
    serverProcess = child;

    let settled = false;
    child.once(
      "message",
      ({ port, supportedIds }: { port: number; supportedIds: number[] }) => {
        settled = true;
        supportedVendorProductIds = new Set(supportedIds);
        serverPort = port;
        resolve(port);
      },
    );
    child.once("exit", (code) => {
      if (serverProcess === child) {
        serverProcess = undefined;
        serverPort = undefined;
      }
      if (!settled) {
        settled = true;
        reject(new Error(`Server process exited before ready (code ${code})`));
      }
    });
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

  // Replace Electron in the User-Agent with via-desktop so VIA shows its built-in
  // Authorize buttons, giving users a real user gesture for unknown HID devices.
  mainWindow.webContents.setUserAgent(
    mainWindow.webContents
      .getUserAgent()
      .replace(/\bElectron\//, "via-desktop/"),
  );

  // Open external links in the system browser instead of a bare Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const loggedAllowedDevices = new Set<number>();
  let pickerOpen = false;

  const isAllowedDevice = (vendorProductId: number) =>
    supportedVendorProductIds.has(vendorProductId) ||
    getAllowedUnknownDevices().has(vendorProductId);

  // Register a device permission handler that allows access to the devices registered in the VIA definitions files
  // or previously approved by the user through the unknown-device picker.
  mainWindow.webContents.session.setDevicePermissionHandler(
    (details: DevicePermissionHandlerHandlerDetails) => {
      const vendorProductId = getVendorProductId(
        Number(details.device.vendorId),
        Number(details.device.productId),
      );
      if (!isAllowedDevice(vendorProductId)) {
        return false;
      }

      if (!loggedAllowedDevices.has(vendorProductId)) {
        log.info(
          "Allowing device",
          vendorProductId,
          "name" in details.device ? details.device.name : "",
        );
        loggedAllowedDevices.add(vendorProductId);
      }

      return true;
    },
  );

  const selectHidDevice = async (
    event: Event,
    { deviceList }: SelectHidDeviceDetails,
    callback: (deviceId?: string) => void,
  ) => {
    event.preventDefault();
    const candidates = deviceList.filter(
      (device) =>
        !isAllowedDevice(getVendorProductId(device.vendorId, device.productId)),
    );
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
          "This keyboard is not in VIA's built-in device list. Select a device to allow it, or Cancel to ignore it.",
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
        callback(chosen.deviceId);
      } else {
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
    if (!mainWindow.isDestroyed()) {
      await mainWindow.loadURL(APP_ORIGIN);
    }
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
      loggedAllowedDevices.clear();
      if (!mainWindow.isDestroyed()) {
        await mainWindow.loadURL(APP_ORIGIN);
      }
    },
  );

  await mainWindow.loadURL(APP_ORIGIN);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  protocol.handle(APP_SCHEME, (request) => {
    if (serverPort === undefined) {
      return new Response("Local server is not running", { status: 503 });
    }
    const requested = new URL(request.url);
    const url = new URL(
      requested.pathname + requested.search,
      `http://127.0.0.1:${serverPort}`,
    );
    return fetch(url, { method: request.method });
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

app.on("before-quit", () => {
  serverProcess?.kill();
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
