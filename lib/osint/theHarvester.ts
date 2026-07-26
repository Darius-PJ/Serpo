import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DecisionMakerResult, OsintConnector } from "./types";

interface TheHarvesterJson {
  emails?: string[];
  // Some theHarvester modules (e.g. LinkedIn) surface names in this field
  // depending on version/plugins installed — treated as optional.
  people?: string[];
}

function runTheHarvester(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`theHarvester exited ${code}: ${stderr.trim()}`));
      else resolve();
    });
  });
}

export const theHarvesterConnector: OsintConnector = {
  key: "theharvester",
  label: "theHarvester",

  isConfigured() {
    return Boolean(process.env.THEHARVESTER_CMD);
  },

  async research(domain: string): Promise<DecisionMakerResult[]> {
    const cmd = process.env.THEHARVESTER_CMD || "theHarvester";
    const workDir = await mkdtemp(path.join(tmpdir(), "theharvester-"));
    const outputBase = path.join(workDir, "result");

    try {
      // -b all: query every source module theHarvester supports.
      // -f writes {outputBase}.json / .xml with structured results.
      await runTheHarvester(cmd, ["-d", domain, "-b", "all", "-f", outputBase]);

      const raw = await readFile(`${outputBase}.json`, "utf-8");
      const data = JSON.parse(raw) as TheHarvesterJson;

      const results: DecisionMakerResult[] = [];
      for (const email of data.emails ?? []) {
        results.push({ email, sourceTool: "theharvester", confidence: "email-harvest" });
      }
      for (const name of data.people ?? []) {
        results.push({ name, sourceTool: "theharvester", confidence: "name-harvest" });
      }
      return results;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
};
