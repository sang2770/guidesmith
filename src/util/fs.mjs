import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeFile(file, contents) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, contents);
  return file;
}

export function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export function writeJson(file, value) {
  return writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function exists(p) {
  return fs.existsSync(p);
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function fileHash(file) {
  return sha256(fs.readFileSync(file));
}

/** Copy a directory recursively without clobbering files that already exist. */
export function copyDirSafe(from, to, { overwrite = false } = {}) {
  const written = [];
  const skipped = [];
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      ensureDir(dest);
      const r = copyDirSafe(src, dest, { overwrite });
      written.push(...r.written);
      skipped.push(...r.skipped);
    } else if (fs.existsSync(dest) && !overwrite) {
      skipped.push(dest);
    } else {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
      written.push(dest);
    }
  }
  return { written, skipped };
}

/** Relative POSIX path, for writing into markdown/JSON. */
export function relPosix(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}
