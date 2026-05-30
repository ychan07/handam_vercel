const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = __dirname;
const output = path.join(root, "dist");
const staticFiles = ["index.html", "styles.css", "app.js", "interactions.js", "prompt-animations.js", "db-worker.js", "manifest.webmanifest"];

console.log("Building React UI (react-bits splash)...");
execSync("npx vite build", { cwd: root, stdio: "inherit" });

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of staticFiles) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

const uiDist = path.join(root, "ui-dist");
if (fs.existsSync(uiDist)) {
  fs.mkdirSync(path.join(output, "ui-dist"), { recursive: true });
  for (const name of fs.readdirSync(uiDist)) {
    fs.copyFileSync(path.join(uiDist, name), path.join(output, "ui-dist", name));
  }
}

console.log("Static web app exported to dist");
