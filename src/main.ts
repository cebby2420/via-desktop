import {
  app,
  BrowserWindow,
  DevicePermissionHandlerHandlerDetails,
  utilityProcess,
} from "electron";
import path from "path";
import fs from "fs";
import process from "process";
import started from "electron-squirrel-startup";
import { downloadFile, copyFolder } from "./utils";
import log from "electron-log/main";

// This hardcoded url is obviously not a good idea, but what can you do?
const VIA_BASE_URL = "https://usevia.app/";

let serverPort: number;
const previouslyAllowedDevices: number[] = [];
const defsFileDir = path.join(app.getPath("sessionData"), "definitions");
const defsFilePath = path.join(defsFileDir, "supported_kbs.json");
const hashFilePath = path.join(defsFileDir, "hash.json");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    minHeight: 768,
    minWidth: 1024,
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  const supportedVendorProductIds: number[] = [];
  const definitionsFileContents = fs.readFileSync(defsFilePath);
  const definitions = JSON.parse(definitionsFileContents.toString());
  supportedVendorProductIds.push(
    ...Object.values<number>(definitions.vendorProductIds.v2),
    ...Object.values<number>(definitions.vendorProductIds.v3),
  );

  // Register a device permission handler that allows access to the devices registered in the VIA definitions files
  mainWindow.webContents.session.setDevicePermissionHandler(
    (details: DevicePermissionHandlerHandlerDetails) => {
      const vendorProductId =
        Number(details.device.vendorId) * 65536 +
        Number(details.device.productId);
      if (previouslyAllowedDevices.includes(vendorProductId)) {
        return true;
      }

      if (supportedVendorProductIds.includes(vendorProductId)) {
        log.info(
          "Allowing device",
          vendorProductId,
          "name" in details.device ? details.device.name : "",
        );
        previouslyAllowedDevices.push(vendorProductId);
        return true;
      }

      return false;
    },
  );
};

const downloadKeyboardDefinitions = async () => {
  try {
    // Check when the definitions file was last updated
    const defsLastUpdated = fs.existsSync(defsFilePath)
      ? fs.statSync(defsFilePath).mtime
      : new Date(0);
    const elapsedTime = new Date().getTime() - defsLastUpdated.getTime();

    if (elapsedTime > 1000 * 60 * 60 * 24) {
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
  // Check if the definitions folder exists, if not, copy the initial definitions
  try {
    if (!fs.existsSync(defsFilePath) || !fs.existsSync(hashFilePath)) {
      log.info(
        "Loading initial definitions",
        path.join(__dirname, "definitions"),
      );
      // Copy the initial definitions to the definitions folder without recursive option in copy function
      fs.mkdirSync(defsFileDir, { recursive: true });
      copyFolder(path.join(__dirname, "definitions"), defsFileDir);
    }
  } catch (e) {
    log.error(e);
  }

  await downloadKeyboardDefinitions();

  const serverProcess = utilityProcess.fork(path.join(__dirname, "server.js"), [
    defsFileDir,
    VIA_BASE_URL,
  ]);
  serverProcess.once("message", (port: number) => {
    serverPort = port;
    createWindow();
  });
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
