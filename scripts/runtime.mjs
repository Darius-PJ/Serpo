import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export function assertSupportedNode(version = process.versions.node) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match || Number(match[1]) !== 24 || Number(match[2]) < 18) {
    throw new Error(`Serpo needs Node.js >=24.18.0 <25; this is ${version}. Install Node 24.18.0 or a newer Node 24 release from https://nodejs.org.`);
  }
}

export class OwnedProcessTreeError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "OwnedProcessTreeError";
  }
}

export async function stopOwnedProcess(child) {
  if (!child?.pid) return;
  // An exited parent PID is no longer authority to kill or identify its tree.
  // Descendants may still be running even though Node emitted close.
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new OwnedProcessTreeError("The owned parent already exited; surviving descendants cannot be ruled out.");
  }
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  child.once("close", resolveClosed);
  try {
    if (process.platform !== "win32") {
      let grouped = true;
      try { process.kill(-child.pid, "SIGTERM"); }
      catch (error) {
        if (error.code !== "ESRCH") throw error;
        grouped = false;
        child.kill("SIGTERM");
      }
      await closed;
      if (!grouped) throw new Error("Only the parent was stopped; its descendant tree could not be confirmed.");
      // A successful signal is not proof that every member exited. Probe only:
      // never send a destructive signal using the now-exited parent's PID.
      const deadline = Date.now() + 2000;
      while (true) {
        try { process.kill(-child.pid, 0); }
        catch (error) { if (error.code === "ESRCH") return; throw error; }
        if (Date.now() >= deadline) throw new Error("The owned process group still exists after parent exit.");
        await delay(25);
      }
    }
    // A live ChildProcess is the sole authority: never kill by name, port, or
    // a PID recovered from state. /T includes Next and JobSpy descendants.
    const code = await new Promise((resolve, reject) => {
      const kill = spawn(path.join(process.env.WINDIR || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      kill.once("error", reject);
      kill.once("close", resolve);
    });
    // A failed tree stop cannot become successful merely because its parent
    // exited during the attempt. That is exactly when descendants can escape.
    if (code !== 0) throw new Error(`Owned process tree shutdown was not confirmed (taskkill exit ${code ?? "unknown"}).`);
    await closed;
  } catch (error) {
    throw new OwnedProcessTreeError(error.message, { cause: error });
  } finally { child.removeListener("close", resolveClosed); }
}
