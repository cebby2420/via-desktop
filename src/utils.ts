import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

export const downloadFile = async (url: string, dest: string) => {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    https.get(url, (response: http.IncomingMessage) => {
      const pipe = response.pipe(file);
      pipe.on("finish", () => {
        resolve(file);
      });
    });
  });
};
