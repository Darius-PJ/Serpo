import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { startSerpoHost, stopOwnedProcess } from "../../scripts/serpoHost.mjs";
import { spawn } from "node:child_process";

async function fixture(overrides = {}) {
  const stateRoot = await mkdtemp(path.join(tmpdir(), "serpo-host-test-"));
  const child = new EventEmitter();
  const browser = new EventEmitter();
  const page = new EventEmitter();
  const calls = [];
  browser.close = async () => { calls.push("browser"); browser.emit("close"); };
  page.bringToFront = async () => { calls.push("focus"); };
  browser.pages = () => [page];
  let env;
  const host = await startSerpoHost({ port: 3999, stateRoot, ready: async () => true,
    startChild: (value) => { env = value; return child; }, openWindow: async () => browser,
    stopChild: async (owned) => { assert.equal(owned, child); calls.push("server"); }, ...overrides });
  return { host, browser, page, calls, env, cleanup: async () => { await host.stop(); await rm(stateRoot, { recursive: true, force: true }); } };
}

test("controller rejects unauthorized requests and passes private credentials only to its server", async () => {
  const f = await fixture();
  try {
    assert.equal(f.env.SERPO_CONTROL_PORT, String(f.host.controlPort));
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
