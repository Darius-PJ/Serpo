import { constants, createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, readlink, rename, rm, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

export async function pathExists(value) {
  try { await lstat(value); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

// Portable paths deliberately exclude Windows device names, alternate streams,
// and normalization aliases, even when a backup is created on another OS.
export function validateRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || path.posix.isAbsolute(value)) {
    throw new Error(`Unsafe relative path: ${String(value)}`);
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe relative path: ${value}`);
  }
  return value;
}

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function assertSafePath(value, { allowMissing = false, directory = false } = {}) {
  const absolute = path.resolve(value);
  const root = path.parse(absolute).root;
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if (error.code === "ENOENT" && allowMissing) return absolute;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link or junction: ${current}`);
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error(`Parent is not a directory: ${current}`);
    if (index === parts.length - 1 && directory && !info.isDirectory()) throw new Error(`Not a directory: ${current}`);
  }
  return absolute;
}

export async function listTree(root) {
  await assertSafePath(root, { directory: true });
  const files = [];
  const directories = [];
  async function visit(relative) {
    const folder = path.join(root, relative);
    for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = validateRelativePath(relative ? `${relative}/${entry.name}` : entry.name);
      const absolute = path.join(root, ...name.split("/"));
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link or junction: ${absolute}`);
      if (info.isDirectory()) { directories.push(name); await visit(name); }
      else if (info.isFile()) files.push(name);
      else throw new Error(`Refusing non-regular file: ${absolute}`);
    }
  }
  await visit("");
  return { files, directories };
}

export async function copyTree(source, destination, { exclude = () => false } = {}) {
  await assertSafePath(source, { directory: true });
  await assertSafePath(destination, { allowMissing: true });
  await mkdir(destination);
  async function visit(relative) {
    const folder = path.join(source, relative);
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const name = validateRelativePath(relative ? `${relative}/${entry.name}` : entry.name);
      if (exclude(name)) continue;
      const from = path.join(source, ...name.split("/"));
      const to = path.join(destination, ...name.split("/"));
      const info = await lstat(from);
      if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link or junction: ${from}`);
      if (info.isDirectory()) { await mkdir(to); await visit(name); }
      else if (info.isFile()) await copySafeFile(from, to);
      else throw new Error(`Refusing non-regular file: ${from}`);
    }
  }
  await visit("");
}

export async function copySafeFile(source, destination) {
  await assertSafePath(source);
  if (!(await lstat(source)).isFile()) throw new Error(`Not a regular file: ${source}`);
  await assertSafePath(destination, { allowMissing: true });
  await copyFile(source, destination, constants.COPYFILE_EXCL);
}

export async function hashFile(file) {
  await assertSafePath(file);
  if (!(await lstat(file)).isFile()) throw new Error(`Not a regular file: ${file}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { flags: constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) })) hash.update(chunk);
  return hash.digest("hex");
}

export async function removeCreatedTree(root) {
  if (!(await pathExists(root))) return;
  await listTree(root);
  await rm(root, { recursive: true });
}

// Turbopack emits absolute package junctions in this generated directory.
// Materialize only a package-name/hash alias to that same installed package,
// so moving a staged app cannot strand its runtime dependency references.
// General workspace/data scans and copies still reject every link.
export async function materializeNextBuildPackages(projectRoot) {
  projectRoot = await assertSafePath(projectRoot, { directory: true });
  const aliases = path.join(projectRoot, ".next", "node_modules");
  if (!(await pathExists(aliases))) return;
  await assertSafePath(aliases, { directory: true });
  const dependencies = path.join(projectRoot, "node_modules");
  await assertSafePath(dependencies, { directory: true });

  async function visit(folder, scope = "") {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = validateRelativePath(scope ? `${scope}/${entry.name}` : entry.name);
      const alias = path.join(folder, entry.name);
      const info = await lstat(alias);
      if (!info.isSymbolicLink()) {
        if (info.isDirectory()) {
          if (!scope && entry.name.startsWith("@")) await visit(alias, entry.name);
          else await listTree(alias); // Already materialized: no nested links.
        } else if (!info.isFile()) throw new Error(`Refusing non-regular generated package: ${alias}`);
        continue;
      }

      const declaredTarget = await readlink(alias);
      const target = path.resolve(folder, declaredTarget);
      if (!isWithin(dependencies, target)) throw new Error(`Generated package link escapes installed node_modules: ${alias}`);
      const packageName = validateRelativePath(path.relative(dependencies, target).split(path.sep).join("/"));
      const parts = packageName.split("/");
      if (!((parts.length === 1 && !parts[0].startsWith("@")) || (parts.length === 2 && parts[0].startsWith("@")))) {
        throw new Error(`Generated link is not an installed package root: ${alias}`);
      }
      // This rejects target/ancestor junctions before reading package metadata
      // or copying any bytes, even when a link resolves lexically inside root.
      await assertSafePath(target, { directory: true });
      const metadata = path.join(target, "package.json");
      await assertSafePath(metadata);
      const pkg = JSON.parse(await readFile(metadata, "utf8"));
      if (pkg.name !== packageName || !relative.startsWith(`${packageName}-`) || !/^[a-f0-9]{16}$/.test(relative.slice(packageName.length + 1))) {
        throw new Error(`Unrecognized generated package alias: ${alias}`);
      }

      const replacement = path.join(folder, `.serpo-materialized-${randomUUID()}`);
      const original = path.join(folder, `.serpo-package-link-${randomUUID()}`);
      try {
        await copyTree(target, replacement); // Reject links anywhere in package.
        if (!(await lstat(alias)).isSymbolicLink() || await readlink(alias) !== declaredTarget) {
          throw new Error(`Generated package link changed during materialization: ${alias}`);
        }
        await rename(alias, original);
        try { await rename(replacement, alias); }
        catch (error) {
          try { await rename(original, alias); }
          catch (rollback) { throw new Error(`Generated package replacement failed; original link retained at ${original}.`, { cause: new AggregateError([error, rollback]) }); }
          throw error;
        }
        await unlink(original); // Unlink the junction itself, never its target.
      } finally {
        if (await pathExists(replacement)) await removeCreatedTree(replacement);
      }
    }
  }
  await visit(aliases);
}
