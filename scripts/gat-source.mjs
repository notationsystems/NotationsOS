import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, parse } from 'node:path';

/** @param {string} path */
export function requireRegularPath(path) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, segment);
    const info = lstatSync(current);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error('Unsafe runtime path.');
  }
  return absolute;
}

/** @param {string} root @param {{sourceFiles: Record<string,string>, sourceTreeDigest:string}} pin */
export function verifyGatSource(root, pin) {
  requireRegularPath(root);
  const digest = (/** @type {string|Buffer} */ bytes) => createHash('sha256').update(bytes).digest('hex');
  if (`sha256:${digest(JSON.stringify(pin.sourceFiles))}` !== pin.sourceTreeDigest) throw new Error('Invalid source pin.');
  for (const [relative, expected] of Object.entries(pin.sourceFiles)) {
    const path = join(root, relative);
    requireRegularPath(path);
    const info = lstatSync(path);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Invalid source file.');
    if (digest(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')) !== expected) throw new Error('Source differs from pin.');
  }
  const visit = (/** @type {string} */ relative) => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const key = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error('Unsafe source entry.');
      if (entry.isDirectory()) visit(key);
      else if (!entry.isFile() || !Object.hasOwn(pin.sourceFiles, key)) throw new Error('Unpinned source entry.');
    }
  };
  visit('gat');
}
