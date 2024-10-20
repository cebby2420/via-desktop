import finalhandler from "finalhandler";
import http from "http";
import serveStatic from "serve-static";
import path from "path";
import fs from "fs";
import { AddressInfo } from "net";
import { downloadFile } from "./utils";
import log from "electron-log/node";

const VIA_BASE_URL = process.argv[3];
const defsFileDir = process.argv[2];

// Get generated at from the supported_kbs.json file
const defsFilePath = path.join(defsFileDir, "supported_kbs.json");
let generatedAt = Date.now();
if (fs.existsSync(defsFilePath)) {
  const defsFileContents = fs.readFileSync(defsFilePath);
  const definitions = JSON.parse(defsFileContents.toString());
  generatedAt = definitions.generatedAt;
}

const serveApplication = serveStatic(path.join(__dirname), {
  index: ["index.html"],
});
const serveDefinitions = serveStatic(defsFileDir, { maxAge: "1d" });

const requestHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
) => {
  if (req.url.includes("definitions")) {
    req.url = req.url.replace("/definitions", "");

    // If the requested file is a definition that is older than generatedAt we want to try to update it
    if (!req.url.includes("supported_kbs.json")) {
      const definitionPath = path.join(defsFileDir, req.url);
      let shouldUpdate = true;
      if (fs.existsSync(definitionPath)) {
        const definitionStats = fs.statSync(definitionPath);
        shouldUpdate = definitionStats.mtime.getTime() <= generatedAt;
      }

      // Download definitions
      if (shouldUpdate) {
        log.info("Updating definition", req.url);
        const url = `${VIA_BASE_URL}definitions${req.url}`;
        await downloadFile(url, definitionPath);
      }
    }

    serveDefinitions(req, res, finalhandler(req, res));
    return;
  }

  serveApplication(req, res, finalhandler(req, res));
};

const server = http.createServer(requestHandler);

server.listen(0, "127.0.0.1", function () {
  const serverPort = (server.address() as AddressInfo).port;
  log.info("Server started", serverPort);
  if (process.parentPort) {
    process.parentPort.postMessage(String(serverPort));
  }
});
