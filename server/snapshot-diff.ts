import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BashChanges } from "../shared/bash-changes";

const run = promisify(execFile);
const maxRowBytes = 60_000; // Paseo rejects timeline rows above 64 KiB.
const maxFiles = 100;

/** One line the snapshot hook writes: the worktree as a git tree before or after a Bash call. */
export interface Snapshot {
  id: string;
  event: string;
  tree: string;
  cwd: string;
}

/** What a Bash call changed between its two snapshots, or null when nothing changed. */
export async function diffSnapshots(before: Snapshot, after: Snapshot): Promise<BashChanges | null> {
  if (!before.tree || !after.tree || before.tree === after.tree) return null;
  const git = async (...args: string[]) =>
    (await run("git", ["-C", before.cwd, "diff", ...args, before.tree, after.tree], { maxBuffer: 256 << 20 })).stdout;
  const [numstat, patch] = await Promise.all([git("--numstat"), git("--no-color", "--no-ext-diff")]);
  const files = numstat.split("\n").filter(Boolean).map((line) => {
    const [additions, deletions, ...path] = line.split("\t");
    // Binary files report "-" for both counts.
    return { path: path.join("\t"), additions: Number(additions) || 0, deletions: Number(deletions) || 0 };
  });
  if (!files.length) return null;
  return fitRow({ files: files.slice(0, maxFiles), fileCount: files.length, patch, truncated: false });
}

/** Shortens the patch at line boundaries until the row fits Paseo's timeline size limit. */
export function fitRow(changes: BashChanges): BashChanges {
  let row = changes;
  while (Buffer.byteLength(JSON.stringify(row)) > maxRowBytes) {
    if (!row.patch) return { ...row, files: [], truncated: true };
    const half = row.patch.slice(0, row.patch.length >> 1);
    row = { ...row, patch: half.slice(0, half.lastIndexOf("\n") + 1), truncated: true };
  }
  return row;
}
