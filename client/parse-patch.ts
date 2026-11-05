export interface PatchLine {
  kind: "add" | "remove" | "context" | "hunk";
  text: string;
  /** New-side line number for added and context lines, old-side for removed lines. */
  number: number | null;
}

export interface PatchFile {
  path: string;
  binary: boolean;
  lines: PatchLine[];
}

/** Splits `git diff` output into files and their lines, numbering each line as git does. */
export function parsePatch(patch: string): PatchFile[] {
  const files: PatchFile[] = [];
  let file: PatchFile | undefined;
  let oldLine = 0;
  let newLine = 0;
  for (const text of patch.split("\n")) {
    if (text.startsWith("diff --git ")) {
      file = { path: text.replace(/^diff --git a\/.* b\//, ""), binary: false, lines: [] };
      files.push(file);
      continue;
    }
    if (!file) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      file.lines.push({ kind: "hunk", text: hunk[3].trim(), number: null });
    } else if (text.startsWith("Binary files ")) {
      file.binary = true;
    } else if (!file.lines.length) {
      continue; // index, mode, rename and ---/+++ headers
    } else if (text.startsWith("+")) {
      file.lines.push({ kind: "add", text: text.slice(1), number: newLine++ });
    } else if (text.startsWith("-")) {
      file.lines.push({ kind: "remove", text: text.slice(1), number: oldLine++ });
    } else if (text.startsWith(" ")) {
      file.lines.push({ kind: "context", text: text.slice(1), number: newLine++ });
      oldLine++;
    }
  }
  return files;
}
