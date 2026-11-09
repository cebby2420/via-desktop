import { BrowserWindow, dialog } from "electron";
import type { Event, SelectHidDeviceDetails } from "electron";
import {
  isKeyboardDefinitionV2,
  isKeyboardDefinitionV3,
  isVIADefinitionV2,
  isVIADefinitionV3,
  keyboardDefinitionV2ToVIADefinitionV2,
  keyboardDefinitionV3ToVIADefinitionV3,
} from "@the-via/reader";
import {
  installConnectionControl,
  requestViaKeyboard,
  storeViaDefinition,
} from "./connection-screen";

function parseViaDefinition(text: unknown) {
  if (typeof text !== "string" || text.length > 4 * 1024 * 1024) {
    throw new Error("Choose a VIA keyboard definition smaller than 4 MB.");
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (isVIADefinitionV3(input)) return { definition: input, version: "v3" };
  if (isKeyboardDefinitionV3(input)) {
    return {
      definition: keyboardDefinitionV3ToVIADefinitionV3(input),
      version: "v3",
    };
  }
  if (isVIADefinitionV2(input)) return { definition: input, version: "v2" };
  if (isKeyboardDefinitionV2(input)) {
    return {
      definition: keyboardDefinitionV2ToVIADefinitionV2(input),
      version: "v2",
    };
  }
  throw new Error(
    "Choose a VIA keyboard definition JSON file. A saved layout export is a different file.",
  );
}

export function registerViaHid(
  window: BrowserWindow,
  origin: string,
  isKnownDevice: (vendorId: number, productId: number) => boolean,
): () => Promise<void> {
  const contents = window.webContents;
  const session = contents.session;
  const isViaPage = (url: string) =>
    url === origin || url.startsWith(origin + "/");
  let busy = false;
  let pickerRequested = false;
  let pendingDefinitionId: number | undefined;

  session.setDevicePermissionHandler(
    ({ deviceType, origin: requester, device }) =>
      deviceType === "hid" &&
      isViaPage(requester) &&
      isKnownDevice(Number(device.vendorId), Number(device.productId)),
  );

  const chooseDevice = async (
    event: Event,
    { frame, deviceList }: SelectHidDeviceDetails,
    callback: (deviceId?: string) => void,
  ) => {
    event.preventDefault();
    if (
      !pickerRequested ||
      contents.isDestroyed() ||
      frame !== contents.mainFrame ||
      !isViaPage(frame.url)
    ) {
      callback();
      return;
    }

    // VIA also asks for a device during background scans. Consume the one
    // explicit request before awaiting the picker so those scans stay quiet.
    pickerRequested = false;
    if (deviceList.length === 0) {
      callback();
      return;
    }
    try {
      const cancelId = deviceList.length;
      const choice = await dialog.showMessageBox(window, {
        message: "Connect a VIA keyboard",
        detail: "Choose the keyboard you want VIA Desktop to configure.",
        buttons: [
          ...deviceList.map(
            ({ name, vendorId, productId }) =>
              `${name || "USB keyboard"} (${vendorId.toString(16)}:${productId.toString(16)})`,
          ),
          "Cancel",
        ],
        cancelId,
        defaultId: cancelId,
      });
      callback(deviceList[choice.response]?.deviceId);
    } catch {
      callback();
    }
  };
  session.on("select-hid-device", chooseDevice);
  window.on("closed", () => session.off("select-hid-device", chooseDevice));

  async function connect(
    text?: unknown,
  ): Promise<{ granted: boolean; message: string }> {
    if (busy || contents.isDestroyed() || !isViaPage(contents.getURL())) {
      return { granted: false, message: "" };
    }
    busy = true;
    try {
      if (text !== undefined) {
        const { definition, version } = parseViaDefinition(text);
        await contents.executeJavaScript(
          `(${storeViaDefinition})(${JSON.stringify(definition)}, ${JSON.stringify(version)})`,
        );
        pendingDefinitionId = definition.vendorProductId;
      }

      const filter = {
        usagePage: 0xff60,
        usage: 0x61,
        ...(pendingDefinitionId !== undefined && {
          vendorId: pendingDefinitionId >>> 16,
          productId: pendingDefinitionId & 0xffff,
        }),
      };
      pickerRequested = true;
      const granted: boolean = await contents.executeJavaScript(
        `(${requestViaKeyboard})(${JSON.stringify(filter)}, ${pendingDefinitionId === undefined})`,
        true,
      );
      if (!granted) {
        const saved =
          pendingDefinitionId === undefined ? "" : "Definition saved. ";
        return {
          granted: false,
          message:
            saved +
            "No keyboard connected. Check the USB cable and wired mode, then try Connect VIA keyboard.",
        };
      }
      if (pendingDefinitionId !== undefined) {
        pendingDefinitionId = undefined;
        // VIA loads its custom definitions at startup. The permission survives
        // navigation within this window, so it can discover the approved device.
        contents.reload();
      }
      return {
        granted: true,
        message: "USB access granted. VIA is reading the keyboard.",
      };
    } catch (error) {
      return {
        granted: false,
        message:
          error instanceof Error ? error.message : "VIA could not connect.",
      };
    } finally {
      pickerRequested = false;
      busy = false;
    }
  }

  contents.ipc.handle("via-desktop:connect", (event, text?: unknown) => {
    if (event.senderFrame !== contents.mainFrame)
      return { granted: false, message: "" };
    return connect(text);
  });
  contents.on("did-finish-load", () => {
    if (isViaPage(contents.getURL())) {
      void contents
        .executeJavaScript(installConnectionControl)
        .catch((error) => {
          console.warn("Could not show the VIA connection buttons", error);
        });
    }
  });

  return async () => {
    const { granted, message } = await connect();
    if (!granted && message && !window.isDestroyed()) {
      await dialog.showMessageBox(window, { message });
    }
  };
}
