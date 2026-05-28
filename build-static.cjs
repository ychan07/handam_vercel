const fs = require("fs");
const path = require("path");

const root = __dirname;
const output = path.join(root, "dist");
const files = ["index.html", "styles.css", "app.js", "db-worker.js", "manifest.webmanifest"];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log("Static web app exported to dist");
