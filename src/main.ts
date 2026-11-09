import { app, BrowserWindow, protocol, utilityProcess } from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import { downloadFile, clearFolder } from "./utils";
import log from "electron-log/main";
import { initMenu } from "./menu";
import { registerViaHid } from "./hid";
import settings from "electron-settings";
import { updateElectronApp } from "update-electron-app";

const VIA_BASE_URL = "https://usevia.app/";
const APP_SCHEME = "via-desktop";
const APP_ORIGIN = `${APP_SCHEME}://index.html`;

let serverPort: number;
let serverProcess: ReturnType<typeof utilityProcess.fork>;
const defsFileDir = path.join(app.getPath("sessionData"), "definitions");
const defsFilePath = path.join(defsFileDir, "supported_kbs.json");
const hashFilePath = path.join(defsFileDir, "hash.json");

const run = (args: string[], done: () => void): void => {
  const updateExe = path.resolve(
    path.dirname(process.execPath),
    "..",
    "Update.exe",
  );
  log("Spawning `%s` with args `%s`", updateExe, args);

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

    serverProcess.once("message", (port: number) => {
      serverPort = port;
      resolve(port);
    });
  });
};

const settingChanged = (window: BrowserWindow) => async (name: string) => {
  if (name === "onlyLocalDefinitions") {
    serverPort = await startServer();
    window.loadURL(`${APP_SCHEME}://index.html`);
  }
};

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: "VIA",
    height: 800,
    width: 1200,
    minHeight: 768,
    minWidth: 1024,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const definitionsFileContents = fs.readFileSync(defsFilePath);
  const definitions = JSON.parse(definitionsFileContents.toString());
  const supportedVendorProductIds = new Set([
    ...Object.values<number>(definitions.vendorProductIds.v2),
    ...Object.values<number>(definitions.vendorProductIds.v3),
  ]);
  const connectKeyboard = registerViaHid(
    mainWindow,
    APP_ORIGIN,
    (vendorId, productId) =>
      !!settings.getSync("allowUnknownDevices") ||
      supportedVendorProductIds.has(vendorId * 65536 + productId),
  );
  initMenu(
    downloadKeyboardDefinitions,
    settingChanged(mainWindow),
    connectKeyboard,
  );

  await mainWindow.loadURL(APP_ORIGIN);
};

const downloadKeyboardDefinitions = async (force = false) => {
  const onlyLocalDefinitions = await settings.get("onlyLocalDefinitions");
  if (onlyLocalDefinitions) {
    return;
  }

  try {
    // Check when the definitions file was last updated
    const defsLastUpdated = fs.existsSync(defsFilePath)
      ? fs.statSync(defsFilePath).mtime
      : new Date(0);
    const elapsedTime = new Date().getTime() - defsLastUpdated.getTime();

    if (elapsedTime > 1000 * 60 * 60 * 24 || force) {
      clearFolder(defsFileDir);
      await downloadFile(
        `${VIA_BASE_URL}definitions/supported_kbs.json`,
        defsFilePath,
      );
      await downloadFile(`${VIA_BASE_URL}definitions/hash.json`, hashFilePath);
    } else {
      log.info("Definitions file is up to date");
    }
  } catch (e) {
    log.error(e);
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  protocol.handle(APP_SCHEME, (request) => {
    const baseUrl = `http://localhost:${serverPort}`;
    const url = new URL(
      baseUrl + request.url.replace(`${APP_SCHEME}://index.html/`, "/"),
    );
    // forward everything as-is, we want to support whatever was originally intended
    return fetch(url, { ...request });
  });

  // Check if the definitions folder exists, if not, copy the initial definitions
  try {
    if (!fs.existsSync(defsFilePath) || !fs.existsSync(hashFilePath)) {
      const packagedDefinitions = path.join(
        app.isPackaged ? process.resourcesPath : app.getAppPath(),
        "public",
        "definitions",
      );
      log.info("Loading initial definitions", packagedDefinitions);
      fs.mkdirSync(defsFileDir, { recursive: true });
      fs.copyFileSync(
        path.join(packagedDefinitions, "supported_kbs.json"),
        defsFilePath,
      );
      fs.copyFileSync(
        path.join(packagedDefinitions, "hash.json"),
        hashFilePath,
      );
    }
  } catch (e) {
    log.error(e);
  }

  // Check if settings exist, if not, create them
  if (!settings.hasSync("onlyLocalDefinitions")) {
    settings.setSync({
      onlyLocalDefinitions: false,
      allowUnknownDevices: false,
    });
  }

  await downloadKeyboardDefinitions();

  await startServer();
  await createWindow();
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
