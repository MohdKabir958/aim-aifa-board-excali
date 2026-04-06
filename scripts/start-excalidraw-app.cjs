/**
 * Start Vite for excalidraw-app without requiring a global `yarn` on PATH.
 * Uses the repo-root hoisted vite binary and sets cwd to excalidraw-app.
 */
const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "excalidraw-app");
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");

const child = spawn(process.execPath, [viteCli], {
  cwd: appDir,
  stdio: "inherit",
  env: process.env,
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
