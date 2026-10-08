import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSerpoHost } from "../../scripts/serpoHost.mjs";
import { OwnedProcessTreeError, stopOwnedProcess } from "../../scripts/runtime.mjs";
import { acquireWorkspaceLock } from "../../scripts/workspaceLock.mjs";
import { setupWorkspace } from "../../scripts/setup.mjs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

async function isolatedRoots() {
  const base = await mkdtemp(path.join(tmpdir(), "serpo-host-test-"));
  const projectRoot = path.join(base, "workspace");
  const stateRoot = path.join(base, "state");
  await mkdir(projectRoot);
  return { base, projectRoot, stateRoot };
}

async function fixture(overrides = {}) {
  const roots = await isolatedRoots();
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const browser = new EventEmitter();
  const page = new EventEmitter();
  const calls = [];
  browser.close = async () => { calls.push("browser"); browser.emit("close"); };
  page.bringToFront = async () => { calls.push("focus"); };
  browser.pages = () => [page];
  const host = await startSerpoHost({ port: 3999, ...roots, ready: async () => true,
    startChild: () => child, openWindow: async () => browser,
    stopChild: async (owned) => {
      assert.equal(owned, child);
      calls.push("server");
      child.exitCode = 0;
      child.emit("close", 0);
    }, ...overrides });
  return { host, child, browser, page, calls, ...roots, cleanup: async () => { await host.stop(); await rm(roots.base, { recursive: true, force: true }); } };
}

test("startup progress stops changing after the host reports its running phase", async (t) => {
  const progressRoot = await mkdtemp(path.join(tmpdir(), "serpo-host-progress-"));
  t.after(() => rm(progressRoot, { recursive: true, force: true }));
  const progressPath = path.join(progressRoot, "status.json");
  const f = await fixture({ progressPath });
  try {
    const beforeStop = await readFile(progressPath, "utf8");
    const status = JSON.parse(beforeStop);
    assert.equal(status.state, "running");
    assert.equal(status.phase, "window");
    await f.host.stop();
    assert.equal(await readFile(progressPath, "utf8"), beforeStop);
  } finally { await f.cleanup(); }
});

test("host readiness requires the branded healthy health response", async () => {
  const roots = await isolatedRoots();
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const responses = [
    { status: "ok", database: "ok" },
    { app: "serpo", status: "ok" },
    { app: "serpo", status: "degraded", database: "ok" },
    { app: "serpo", status: "ok", database: "ok" },
  ];
  let requests = 0;
  let redirectTargets = 0;
  const health = createServer((request, response) => {
    if (request.url === "/redirect-target") {
      redirectTargets += 1;
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(responses.at(-1)));
      return;
    }
    const requestCount = ++requests;
    if (requestCount === 4) {
      response.writeHead(302, { Location: "/redirect-target" }).end();
      return;
    }
    const body = responses[Math.min(requestCount - 1, responses.length - 1)];
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
    if (requestCount > 5) {
      setImmediate(() => { child.exitCode = 1; child.emit("close", 1); });
    }
  });
  await new Promise((resolve, reject) => {
    health.once("error", reject);
    health.listen(0, "127.0.0.1", resolve);
  });
  let host;
  try {
    host = await startSerpoHost({
      port: health.address().port,
      ...roots,
      skipBrowser: true,
      startChild: () => child,
      stopChild: async (owned) => {
        if (owned.exitCode === null && owned.signalCode === null) {
          owned.exitCode = 0;
          owned.emit("close", 0);
        }
      },
    });
    assert.equal(requests, 5);
    assert.equal(redirectTargets, 0);
  } finally {
    await host?.stop();
    if (child.exitCode === null && child.signalCode === null) {
      child.exitCode = 0;
      child.emit("close", 0);
    }
    await new Promise((resolve) => health.close(resolve));
    await rm(roots.base, { recursive: true, force: true });
  }
});

test("controller rejects unauthorized requests without stopping owned processes", async () => {
  const f = await fixture();
  try {
    const res = await fetch(`http://127.0.0.1:${f.host.controlPort}/quit`, { method: "POST" });
    assert.equal(res.status, 403);
    assert.deepEqual(f.calls, []);
  } finally { await f.cleanup(); }
});

test("Quit responds before closing the owned browser and server, and is idempotent", async () => {
  const f = await fixture();
  try {
    const res = await fetch(`http://127.0.0.1:${f.host.controlPort}/quit`, { method: "POST", headers: { Authorization: `Bearer ${f.host.token}` } });
    assert.equal(res.status, 202);
    assert.deepEqual(f.calls, []);
    await f.host.done;
    await f.host.stop();
    assert.deepEqual(f.calls.sort(), ["browser", "server"]);
  } finally { await f.cleanup(); }
});

test("closing the dedicated browser also stops its server", async () => {
  const f = await fixture();
  try { f.browser.emit("close"); await f.host.done; assert.ok(f.calls.includes("server")); }
  finally { await f.cleanup(); }
});

test("closing the main app page quits even with other pages still open", async () => {
  const f = await fixture();
  try { f.page.emit("close"); await f.host.done; assert.ok(f.calls.includes("server")); assert.ok(f.calls.includes("browser")); }
  finally { await f.cleanup(); }
});

test("relaunch focuses the existing owned window", async () => {
  const f = await fixture();
  try {
    const res = await fetch(`http://127.0.0.1:${f.host.controlPort}/focus`, { method: "POST", headers: { Authorization: `Bearer ${f.host.token}` } });
    assert.equal(res.status, 200);
    assert.deepEqual(f.calls, ["focus"]);
  } finally { await f.cleanup(); }
});

test("Windows shutdown stops an owned Node process and its descendant", { skip: process.platform !== "win32" }, async () => {
  const child = spawn(process.execPath, ["-e", "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)"], { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
  const descendant = await new Promise((resolve) => child.stdout.once("data", (data) => resolve(Number(String(data).trim()))));
  assert.ok(descendant > 0);
  try {
    await stopOwnedProcess(child);
    assert.throws(() => process.kill(descendant, 0));
  } finally {
    try { process.kill(descendant); } catch { /* already stopped */ }
    try { child.kill(); } catch { /* already stopped */ }
  }
});

// Stands in for the Next server, which hosts the automation ticker in-process:
// it appends a heartbeat every 20 ms and says so once the interval is running.
const BEATING_SERVER = "const fs=require('node:fs');let beats=0;setInterval(()=>{fs.appendFileSync(process.env.SERPO_TEST_HEARTBEAT,'.');if(++beats===2)console.log('beating')},20)";

// A host whose owned server is a real process, stopped by the real default stopChild (stopOwnedProcess).
async function hostWithBeatingServer() {
  const roots = await isolatedRoots();
  const heartbeat = path.join(roots.base, "heartbeat.log");
  const browser = new EventEmitter();
  const page = new EventEmitter();
  browser.close = async () => {};
  browser.pages = () => [page];
  let child;
  let beating;
  const host = await startSerpoHost({ port: 3999, ...roots, ready: async () => true, openWindow: async () => browser,
    startChild: (env) => {
      child = spawn(process.execPath, ["-e", BEATING_SERVER], { env: { ...env, SERPO_TEST_HEARTBEAT: heartbeat }, stdio: ["ignore", "pipe", "ignore"], windowsHide: true, detached: process.platform !== "win32" });
      beating = once(child.stdout, "data", { signal: AbortSignal.timeout(5000) });
      return child;
    } });
  const cleanup = async () => {
    await host.stop().catch(() => {});
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(roots.base, { recursive: true, force: true, maxRetries: 5 });
  };
  try { await beating; } catch (error) { await cleanup(); throw error; }
  return { host, page, heartbeat, cleanup };
}

async function assertStoppedBeating(heartbeat) {
  const size = (await stat(heartbeat)).size;
  // A real process on the real clock: only waiting can show it no longer beats. Ten heartbeats' worth.
  await delay(200);
  assert.equal((await stat(heartbeat)).size, size);
}

test("Quit leaves no automation running: the server hosting the ticker stops", async () => {
  const f = await hostWithBeatingServer();
  try {
    const res = await fetch(`http://127.0.0.1:${f.host.controlPort}/quit`, { method: "POST", headers: { Authorization: `Bearer ${f.host.token}` } });
    assert.equal(res.status, 202);
    await f.host.done;
    await assertStoppedBeating(f.heartbeat);
  } finally { await f.cleanup(); }
});

test("closing the app window leaves no automation running: the server hosting the ticker stops", async () => {
  const f = await hostWithBeatingServer();
  try {
    f.page.emit("close");
    await f.host.done;
    await assertStoppedBeating(f.heartbeat);
  } finally { await f.cleanup(); }
});

test("a managed session blocks setup and maintenance until its child actually closes", async () => {
  let terminationStarted;
  const terminating = new Promise((resolve) => { terminationStarted = resolve; });
  const f = await fixture({ stopChild: async () => { terminationStarted(); } });
  try {
    await writeFile(path.join(f.projectRoot, "package.json"), "{}");
    await writeFile(path.join(f.projectRoot, "package-lock.json"), "{}");
    const mutation = path.join(f.projectRoot, "maintenance-started");
    await assert.rejects(setupWorkspace({ projectRoot: f.projectRoot, runStep: async () => {
      await writeFile(mutation, "unsafe");
      throw new Error("maintenance entered an active workspace");
    } }));
    await assert.rejects(stat(mutation), { code: "ENOENT" });
    const stopped = f.host.stop();
    await terminating;
    await assert.rejects(acquireWorkspaceLock(f.projectRoot, "backup"));
    f.child.exitCode = 0;
    f.child.emit("close", 0);
    await stopped;
    const lease = await acquireWorkspaceLock(f.projectRoot, "backup");
    await lease.release();
  } finally {
    f.child.exitCode = 0;
    f.child.emit("close", 0);
    await f.cleanup();
  }
});

test("failed startup retains the lease while its child is stopping and releases it afterward", async () => {
  const roots = await isolatedRoots();
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  let terminationStarted;
  const terminating = new Promise((resolve) => { terminationStarted = resolve; });
  const progressPath = path.join(roots.base, "progress.json");
  const startup = startSerpoHost({ port: 3999, ...roots, progressPath, startChild: () => child,
    ready: async () => { throw new Error("readiness failed"); }, skipBrowser: true,
    stopChild: async () => { terminationStarted(); },
  });
  const failed = assert.rejects(startup, /readiness failed/);
  try {
    await terminating;
    await assert.rejects(acquireWorkspaceLock(roots.projectRoot, "restore"));
    child.exitCode = 0;
    child.emit("close", 0);
    await failed;
    const status = JSON.parse(await readFile(progressPath, "utf8"));
    assert.equal(status.state, "failed");
    assert.equal(status.phase, "server");
    assert.match(status.detail, /readiness failed/);
    const lease = await acquireWorkspaceLock(roots.projectRoot, "restore");
    await lease.release();
    await assert.rejects(stat(path.join(roots.stateRoot, "host-state.json")), { code: "ENOENT" });
  } finally {
    child.exitCode = 0;
    child.emit("close", 0);
    await failed;
    await rm(roots.base, { recursive: true, force: true });
  }
});

test("a failed termination cannot unlock a live server and can be retried", async () => {
  let fail = true;
  let owned;
  const f = await fixture({ startChild: () => {
    owned = new EventEmitter();
    owned.exitCode = null;
    owned.signalCode = null;
    return owned;
  }, stopChild: async () => {
    if (fail) throw new Error("termination failed");
    owned.exitCode = 0;
    owned.emit("close", 0);
  } });
  let doneSettled = false;
  void f.host.done.then(() => { doneSettled = true; }, () => { doneSettled = true; });
  try {
    await assert.rejects(f.host.stop(), /termination failed/);
    await assert.rejects(acquireWorkspaceLock(f.projectRoot, "upgrade"));
    assert.equal(doneSettled, false);
    fail = false;
    await f.host.stop();
    await f.host.done;
    const lease = await acquireWorkspaceLock(f.projectRoot, "upgrade");
    await lease.release();
  } finally { fail = false; await f.cleanup(); }
});

test("startup teardown closes a browser that finishes opening after its server exits", async () => {
  const roots = await isolatedRoots();
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  const browser = new EventEmitter();
  let browserClosed = false;
  browser.close = async () => { browserClosed = true; };
  browser.pages = () => [];
  let openingStarted;
  const opening = new Promise((resolve) => { openingStarted = resolve; });
  let finishOpening;
  const window = new Promise((resolve) => { finishOpening = resolve; });
  const startup = startSerpoHost({ port: 3999, ...roots, ready: async () => true,
    startChild: () => child, openWindow: async () => { openingStarted(); return window; },
    stopChild: async () => {},
  });
  const failed = assert.rejects(startup);
  try {
    await opening;
    child.exitCode = 1;
    child.emit("close", 1);
    await assert.rejects(acquireWorkspaceLock(roots.projectRoot, "backup"));
    finishOpening(browser);
    await failed;
    assert.equal(browserClosed, true);
    const lease = await acquireWorkspaceLock(roots.projectRoot, "backup");
    await lease.release();
  } finally {
    child.exitCode = 1;
    child.emit("close", 1);
    finishOpening(browser);
    await failed;
    await rm(roots.base, { recursive: true, force: true });
  }
});

// A real orphan can still mutate its workspace after the server parent exits.
// Its private file-based stop request lets the test clean up without killing
// anything by an exited parent's PID (or by a process name).
const ORPHANED_WRITER = `
const fs = require("node:fs");
const { createServer } = require("node:http");
let writes = 0;
const server = createServer((request, response) => {
  response.setHeader("Connection", "close");
  if (request.headers.authorization !== "Bearer " + process.env.SERPO_TEST_WORKER_TOKEN) {
    response.writeHead(403).end(); return;
  }
  if (request.method !== "POST" || request.url !== "/write") {
    response.writeHead(404).end(); return;
  }
  fs.writeFileSync(process.env.SERPO_TEST_WORKER_RECORD, JSON.stringify({ writes: ++writes }));
  response.writeHead(200).end("written");
});
const stopping = setInterval(() => {
  if (!fs.existsSync(process.env.SERPO_TEST_WORKER_STOP)) return;
  clearInterval(stopping);
  server.closeAllConnections();
  server.close(() => {
    fs.writeFileSync(process.env.SERPO_TEST_WORKER_STOPPED, "stopped");
    process.exit(0);
  });
}, 20);
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port })));
`;

test("unexpected real parent exit retains maintenance exclusion while its descendant can still write", async () => {
  const roots = await isolatedRoots();
  const record = path.join(roots.projectRoot, "surviving-worker-record.json");
  const stopFile = path.join(roots.base, "stop-worker");
  const stoppedFile = path.join(roots.base, "worker-stopped");
  const workerToken = randomUUID();
  const parentProgram = `
    const { spawn } = require("node:child_process");
    // libuv kills non-detached Windows children when their parent exits.
    // Escape that job so this fixture really leaves a surviving descendant.
    const worker = spawn(process.execPath, ["-e", ${JSON.stringify(ORPHANED_WRITER)}], {
      env: process.env, stdio: ["ignore", "pipe", "ignore"], windowsHide: true, detached: true
    });
    worker.stdout.once("data", (data) => process.stdout.write(data));
    process.stdin.once("data", () => process.exit(23));
  `;
  let parent;
  let announcement;
  let workerPort;
  let host;
  try {
    host = await startSerpoHost({ port: 3999, ...roots, skipBrowser: true,
      startChild: (env) => {
        parent = spawn(process.execPath, ["-e", parentProgram], {
          env: { ...env, SERPO_TEST_WORKER_RECORD: record, SERPO_TEST_WORKER_STOP: stopFile,
            SERPO_TEST_WORKER_STOPPED: stoppedFile, SERPO_TEST_WORKER_TOKEN: workerToken },
          stdio: ["pipe", "pipe", "ignore"], windowsHide: true, detached: process.platform !== "win32",
        });
        announcement = once(parent.stdout, "data", { signal: AbortSignal.timeout(5000) });
        return parent;
      },
      ready: async () => {
        workerPort = JSON.parse(String((await announcement)[0])).port;
        return true;
      },
    });
    const exited = once(parent, "close", { signal: AbortSignal.timeout(5000) });
    parent.stdin.end("exit");
    await exited;
    assert.equal(parent.exitCode, 23);
    const written = await fetch(`http://127.0.0.1:${workerPort}/write`, {
      method: "POST", headers: { Authorization: `Bearer ${workerToken}` }, signal: AbortSignal.timeout(2000),
    });
    assert.equal(written.status, 200);
    await written.text();
    assert.deepEqual(JSON.parse(await readFile(record, "utf8")), { writes: 1 });
    await assert.rejects(stopOwnedProcess(parent), OwnedProcessTreeError);
    await assert.rejects(host.done);
    await assert.rejects(acquireWorkspaceLock(roots.projectRoot, "restore"));
  } finally {
    await writeFile(stopFile, "stop this fixture worker");
    if (workerPort) {
      const deadline = Date.now() + 5000;
      while (true) {
        try { await stat(stoppedFile); break; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        if (Date.now() >= deadline) throw new Error("Fixture descendant did not acknowledge its stop request.");
        await delay(20);
      }
    }
    if (parent?.pid && parent.exitCode === null && parent.signalCode === null) await stopOwnedProcess(parent).catch(() => {});
    await host?.stop().catch(() => {});
    // The surviving writer is now stopped; this is deliberate manual recovery
    // of this disposable fixture, never an app-initiated stale-lease removal.
    await rm(roots.base, { recursive: true, force: true, maxRetries: 5 });
  }
});
