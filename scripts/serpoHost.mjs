// Owns only the server and browser created for this Serpo session. Never looks
// up or terminates processes by name, port, or a PID left in a state file.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireWorkspaceLock } from "./workspaceLock.mjs";
import { assertSupportedNode, stopOwnedProcess } from "./runtime.mjs";
import { writeStartupProgress } from "./startupProgress.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function openSerpoWindow(url, profile) {
  const { chromium } = await import("playwright");
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft/Edge/Application/msedge.exe"),
  ];
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  if (!executablePath) throw new Error("Serpo's app window needs Microsoft Edge or Google Chrome installed.");
  return chromium.launchPersistentContext(profile, {
    executablePath, headless: false, viewport: null,
    args: [`--app=${url}`], ignoreDefaultArgs: ["about:blank", "--enable-automation"],
  });
}

export async function startSerpoHost({ port, projectRoot = defaultRoot,
  stateRoot = path.join(process.env.LOCALAPPDATA || projectRoot, "Serpo"), skipBrowser = false, progressPath,
  startChild = (env) => spawn(process.execPath, [path.join(projectRoot, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: projectRoot, env, stdio: "inherit", windowsHide: true, detached: process.platform !== "win32" }),
  openWindow = openSerpoWindow, stopChild = stopOwnedProcess,
  ready = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000), redirect: "manual" });
      if (!response.ok) return false;
      const health = await response.json();
      return health?.app === "serpo" && health.status === "ok" && health.database === "ok";
    } catch { return false; }
  },
}) {
  let phase = "server";
  let detail = "Preparing Serpo server";
  async function report(nextPhase, nextDetail) {
    phase = nextPhase;
    detail = nextDetail;
    await writeStartupProgress(progressPath, { state: "running", phase, detail });
  }
  async function reportFailure(error) {
    const reason = error instanceof Error ? error.message : String(error);
    await writeStartupProgress(progressPath, { state: "failed", phase, detail: `${detail} failed: ${reason}` });
  }
  await report(phase, detail);
  try {
    assertSupportedNode();
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("A valid local port is required.");
  } catch (error) {
    await reportFailure(error);
    throw error;
  }
  const root = path.resolve(projectRoot);
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(16).toString("hex");
  const stateFile = path.join(stateRoot, "host-state.json");
  let child;
  let browser;
  let openingWindow;
  let stateWriting;
  let childClosed = Promise.resolve();
  let serverClosed = true;
  let teardownComplete = false;
  let stopping = false;
  let stopPromise;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  // Prevent startup failures becoming unhandled while readiness is still pending.
  done.catch(() => {});

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
  let lease;
  try { lease = await acquireWorkspaceLock(root, "managed app"); }
  catch (error) { await reportFailure(error); throw error; }
  const interrupt = () => { void stop().catch(console.error); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);

  async function finishStop() {
    const outcomes = await Promise.allSettled([
      (async () => {
        // Startup can be interrupted while Chrome is opening. Its eventual
        // context still belongs to us and must not escape teardown.
        if (openingWindow) await openingWindow.catch(() => {});
        await browser?.close();
      })(),
      (async () => {
        await stopChild(child);
        // A terminator returning is not proof that the child has closed.
        await childClosed;
      })(),
    ]);
    const serverFailure = outcomes[1].status === "rejected" ? outcomes[1].reason : null;
    if (serverFailure && !serverClosed) throw serverFailure;
    // If termination failed, keep the live controller and lease so Quit or a
    // signal can retry; never declare maintenance safe while a child survives.
    try {
      control.closeAllConnections();
      await new Promise((resolve, reject) => control.close((error) => error && error.code !== "ERR_SERVER_NOT_RUNNING" ? reject(error) : resolve()));
      if (stateWriting) await stateWriting.catch(() => {});
      try {
        const saved = JSON.parse(await readFile(stateFile, "utf8"));
        if (saved.session === session) await unlink(stateFile);
      } catch (error) { if (error.code !== "ENOENT") console.error("Could not remove Serpo session state:", error.message); }
    } finally {
      try { if (!serverFailure) await lease.release(); }
      finally {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", interrupt);
        teardownComplete = true;
      }
    }
    if (serverFailure) {
      throw new Error(`Serpo's parent exited without confirmed descendant shutdown. Workspace lease retained at ${path.join(root, ".serpo-workspace.lock")}. Stop all surviving Serpo/Next/JobSpy and direct workspace processes, review recovery data, then manually remove this lease only when the workspace is no longer in use.`, { cause: serverFailure });
    }
    const failure = outcomes.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }

  function stop() {
    stopping = true;
    if (!stopPromise) {
      // Install the shared promise before any stopper can emit close inline.
      stopPromise = Promise.resolve().then(finishStop).then(() => { resolveDone(); }, (error) => {
        if (teardownComplete) rejectDone(error);
        else {
          stopPromise = undefined;
          // Parent close can race the failed-stop result. Do not lose cleanup
          // or treat that close as proof that its descendants were stopped.
          if (serverClosed) void stop().catch(console.error);
        }
        throw error;
      });
    }
    return stopPromise;
  }

  try {
    await report("server", "Starting Serpo server");
    await mkdir(stateRoot, { recursive: true });
    if (stopping) throw new Error("Serpo startup was interrupted.");
    await new Promise((resolve, reject) => {
      const onError = (error) => { control.removeListener("listening", onListening); reject(error); };
      const onListening = () => { control.removeListener("error", onError); resolve(); };
      control.once("error", onError);
      control.once("listening", onListening);
      control.listen(0, "127.0.0.1");
    });
    if (stopping) throw new Error("Serpo startup was interrupted.");
    const controlPort = control.address().port;
    child = startChild({ ...process.env, NODE_ENV: "production", SERPO_CONTROL_PORT: String(controlPort), SERPO_CONTROL_TOKEN: token });
    serverClosed = child.exitCode != null || child.signalCode != null;
    if (!serverClosed) childClosed = new Promise((resolve) => child.once("close", () => {
      serverClosed = true;
      resolve();
      if (!stopping || !stopPromise) void stop().catch(console.error);
    }));
    child.once("error", (error) => { console.error(error); void stop().catch(console.error); });
    await report("server", "Waiting for Serpo to become ready");
    const deadline = Date.now() + 120_000;
    while (!stopping && !(await ready())) {
      if (Date.now() > deadline) throw new Error("Serpo did not become ready within 120 seconds.");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (stopping || serverClosed) throw new Error("Serpo exited before startup finished.");
    if (!skipBrowser) {
      await report("window", "Opening Serpo app window");
      openingWindow = Promise.resolve().then(() => openWindow(`http://127.0.0.1:${port}/dashboard`, path.join(stateRoot, "browser-profile"))).then((context) => { browser = context; return context; });
      await openingWindow;
      if (stopping) throw new Error("Serpo startup was interrupted.");
      browser.once("close", () => { if (!stopping) void stop().catch(console.error); });
      // Closing the main app window also quits when an external job link has
      // opened another tab in this dedicated browser profile.
      browser.pages()[0]?.once("close", () => { if (!stopping) void stop().catch(console.error); });
    }
    if (stopping) throw new Error("Serpo startup was interrupted.");
    // POSIX restricts the token to the owner. Windows inherits per-user
    // %LOCALAPPDATA% ACLs, the same local trust boundary as the workspace.
    stateWriting = writeFile(stateFile, JSON.stringify({ session, port, controlPort, token, projectRoot: root, processId: process.pid }), { mode: 0o600 });
    await stateWriting;
    if (stopping) throw new Error("Serpo startup was interrupted.");
    return { done, stop, controlPort, token };
  } catch (error) { await reportFailure(error); await stop(); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const progressIndex = args.indexOf("--progress-path");
  const progressPath = progressIndex === -1 ? undefined : args[progressIndex + 1];
  try {
    if (progressIndex !== -1 && (!progressPath || !path.isAbsolute(progressPath) || args.indexOf("--progress-path", progressIndex + 1) !== -1)) {
      throw new Error("--progress-path requires one absolute file path.");
    }
    const host = await startSerpoHost({ port: Number(args[0]), skipBrowser: args.includes("--skip-browser"), progressPath });
    await host.done;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
