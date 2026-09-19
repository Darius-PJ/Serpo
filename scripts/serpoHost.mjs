// Owns only the server and browser created for this Serpo session. Never looks
// up or terminates processes by name, port, or a PID left in a state file.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function stopOwnedProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (process.platform !== "win32") {
    child.kill("SIGTERM");
    return new Promise((resolve) => child.once("close", resolve));
  }
  // Windows SIGTERM alone would strand Next's worker and JobSpy children.
  return new Promise((resolve, reject) => {
    const kill = spawn(path.join(process.env.WINDIR || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    kill.once("error", reject);
    kill.once("close", (code) => code === 0 || child.exitCode !== null || child.signalCode !== null ? resolve() : reject(new Error("Could not stop Serpo's server process tree.")));
  });
}

export async function openSerpoWindow(url, profile) {
  const { chromium } = await import("playwright");
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
  ];
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error("Serpo's app window needs Microsoft Edge or Google Chrome installed.");
  return chromium.launchPersistentContext(profile, {
    executablePath, headless: false, viewport: null,
    args: [`--app=${url}`], ignoreDefaultArgs: ["about:blank", "--enable-automation"],
  });
}

export async function startSerpoHost({ port, stateRoot, skipBrowser = false, production = false,
  startChild = (env) => spawn(process.execPath, [path.join(projectRoot, "node_modules/next/dist/bin/next"), production ? "start" : "dev", "-H", "127.0.0.1", "-p", String(port)], { cwd: projectRoot, env, stdio: "inherit", windowsHide: true }),
  openWindow = openSerpoWindow, stopChild = stopOwnedProcess,
  ready = async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } },
}) {
  await mkdir(stateRoot, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(16).toString("hex");
  const stateFile = path.join(stateRoot, "host-state.json");
  let child;
  let browser;
  let stopping = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  // Prevent startup failures becoming unhandled while readiness is still pending.
  done.catch(() => {});

  async function stop() {
    if (stopping) return done;
    stopping = true;
    const outcomes = await Promise.allSettled([browser?.close(), stopChild(child)]);
    control.closeAllConnections();
    await new Promise((resolve) => control.close(resolve));
    try {
      const saved = JSON.parse(await readFile(stateFile, "utf8"));
      if (saved.session === session) await unlink(stateFile);
    } catch (error) { if (error.code !== "ENOENT") console.error("Could not remove Serpo session state:", error.message); }
    const failure = outcomes.find((result) => result.status === "rejected");
    if (failure) rejectDone(failure.reason); else resolveDone();
    return done;
  }

  const control = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.headers.authorization !== `Bearer ${token}`) { response.writeHead(403).end(); return; }
    if (request.method === "POST" && request.url === "/quit") {
      response.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ stopping: true }));
      setTimeout(() => { void stop().catch(console.error); }, 750);
    } else if (request.method === "POST" && request.url === "/focus") {
      if (stopping || !browser) { response.writeHead(409).end(); return; }
      const page = browser.pages()[0];
      void page?.bringToFront().catch(console.error);
      response.writeHead(200).end();
    } else { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { control.once("error", reject); control.listen(0, "127.0.0.1", resolve); });
  const controlPort = control.address().port;
  try {
    child = startChild({ ...process.env, SERPO_CONTROL_PORT: String(controlPort), SERPO_CONTROL_TOKEN: token });
    child.once("error", (error) => { console.error(error); void stop().catch(console.error); });
    child.once("close", () => { if (!stopping) void stop().catch(console.error); });
    const deadline = Date.now() + 120_000;
    while (!stopping && !(await ready())) {
      if (Date.now() > deadline) throw new Error("Serpo did not become ready within 120 seconds.");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (stopping) throw new Error("Serpo exited before startup finished.");
    if (!skipBrowser) {
      browser = await openWindow(`http://127.0.0.1:${port}/dashboard`, path.join(stateRoot, "browser-profile"));
      browser.once("close", () => { if (!stopping) void stop().catch(console.error); });
      // Closing the main app window also quits when an external job link has
      // opened another tab in this dedicated browser profile.
      browser.pages()[0]?.once("close", () => { if (!stopping) void stop().catch(console.error); });
    }
    // mode 0o600 restricts the control token to the owner on POSIX; it is a
    // no-op on Windows, where the file inherits %LOCALAPPDATA% ACLs (same
    // per-user trust boundary as data/app.db). The token only authorizes local
    // shutdown/focus, so this matches the app's existing local-only model.
    await writeFile(stateFile, JSON.stringify({ session, port, controlPort, token, projectRoot, processId: process.pid }), { mode: 0o600 });
    return { done, stop, controlPort, token };
  } catch (error) { await stop(); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("A valid local port is required.");
  const stateRoot = path.join(process.env.LOCALAPPDATA || projectRoot, "Serpo");
  try {
    const host = await startSerpoHost({ port, stateRoot, skipBrowser: process.argv.includes("--skip-browser") });
    process.once("SIGINT", () => { void host.stop().catch(console.error); });
    process.once("SIGTERM", () => { void host.stop().catch(console.error); });
    await host.done;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
