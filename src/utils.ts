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

export const copyFolder = (src: string, dest: string) => {
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach((item) => {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.lstatSync(srcPath).isDirectory()) {
      copyFolder(srcPath, destPath);
    } else {
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  });
};

export const clearFolder = (dirPath: string) => {
  fs.rmSync(dirPath, { recursive: true });
  fs.mkdirSync(dirPath, { recursive: true });
};
