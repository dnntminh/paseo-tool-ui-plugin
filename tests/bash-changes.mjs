import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffSnapshots, fitRow } from "../server/snapshot-diff.ts";
import { parsePatch } from "../client/parse-patch.ts";

const hooks = new URL("../hooks/", import.meta.url).pathname;
const repo = mkdtempSync(join(tmpdir(), "bash-changes-repo-"));
const events = join(repo, "..", `${repo.split("/").pop()}.jsonl`);
const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
git("init", "-q");
writeFileSync(join(repo, "a.txt"), "one\n");
git("add", "-A");
git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");

const snapshot = (event, env = { PASEO_TOOL_UI_EVENTS: events }) => execFileSync("sh", [join(hooks, "paseo-tool-ui-snapshot.sh")], {
  input: JSON.stringify({ tool_use_id: "toolu_1", hook_event_name: event, cwd: repo }),
  env: { ...process.env, ...env },
  encoding: "utf8",
});

// Prints nothing, and does nothing for agents the plugin didn't open.
assert.equal(snapshot("PreToolUse", { PASEO_TOOL_UI_EVENTS: "" }), "");
assert.equal(existsSync(events), false);

assert.equal(snapshot("PreToolUse"), "");
writeFileSync(join(repo, "a.txt"), "two\n");            // tracked change
writeFileSync(join(repo, "new.txt"), "fresh\n");        // untracked file
snapshot("PostToolUse");
const [before, after] = readFileSync(events, "utf8").trim().split("\n").map((line) => JSON.parse(line));
assert.equal(before.id, "toolu_1");
assert.notEqual(before.tree, after.tree);
assert.equal(git("status", "--porcelain"), " M a.txt\n?? new.txt\n"); // real index untouched

const changes = await diffSnapshots(before, after);
assert.deepEqual(changes.files, [
  { path: "a.txt", additions: 1, deletions: 1 },
  { path: "new.txt", additions: 1, deletions: 0 },
]);
assert.match(changes.patch, /^-one\n\+two$/m);
assert.equal(await diffSnapshots(after, after), null);

// The renderer's parser numbers lines as git does and skips file headers.
const parsed = parsePatch(changes.patch);
assert.deepEqual(parsed.map((file) => file.path), ["a.txt", "new.txt"]);
assert.deepEqual(parsed[0].lines.map(({ kind, text, number }) => [kind, text, number]),
  [["hunk", "", null], ["remove", "one", 1], ["add", "two", 1]]);
assert.deepEqual(parsePatch("diff --git a/x b/x\nindex 1..2\n@@ -3,3 +3,3 @@ fn\n keep\n-old\n+new\n keep\n")[0].lines
  .map(({ kind, number }) => `${kind}:${number}`), ["hunk:null", "context:3", "remove:4", "add:4", "context:5"]);

// Oversized diffs are cut at line boundaries to fit Paseo's 64 KiB row limit.
const big = fitRow({ files: [], fileCount: 1, patch: "+é line\n".repeat(20_000), truncated: false });
assert.ok(Buffer.byteLength(JSON.stringify(big)) <= 60_000);
assert.ok(big.truncated && big.patch.endsWith("\n"));

// setup.sh adds and removes the plugin and hooks, keeps other settings, and never duplicates.
const home = mkdtempSync(join(tmpdir(), "bash-changes-home-"));
const settings = join(home, ".claude", "settings.json");
const bin = join(home, "bin");
const calls = join(home, "paseo-calls");
execFileSync("mkdir", ["-p", join(home, ".claude"), bin]);
// Stub paseo: "installed" while the marker file exists, at this repository's path.
writeFileSync(join(bin, "paseo"), `#!/bin/sh
echo "$*" >> '${calls}'
case "$2" in
  ls) [ -f '${home}/installed' ] && echo '[{"path":"${join(hooks, "..")}"}]' || echo '[]' ;;
  add) touch '${home}/installed' ;;
  remove) rm '${home}/installed' ;;
esac
`, { mode: 0o755 });
const setup = (mode) => execFileSync("sh", [join(hooks, "setup.sh"), mode], {
  env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
});
const original = { theme: "dark", hooks: { PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "mine" }] }] } };
writeFileSync(settings, JSON.stringify(original));
setup("install");
setup("install");
const installed = JSON.parse(readFileSync(settings, "utf8"));
assert.equal(installed.theme, "dark");
assert.equal(installed.hooks.PreToolUse.length, 2);
assert.equal(installed.hooks.PostToolUse.length, 1);
assert.ok(existsSync(join(home, ".claude", "hooks", "paseo-tool-ui-snapshot.sh")));
setup("uninstall");
assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")), original);
assert.equal(existsSync(join(home, ".claude", "hooks", "paseo-tool-ui-snapshot.sh")), false);
assert.deepEqual(readFileSync(calls, "utf8").split("\n").filter((call) => !call.startsWith("plugin ls")),
  ["plugin add https://github.com/dnntminh/paseo-tool-ui-plugin.git", "plugin remove paseo-tool-ui-plugin", ""]);

console.log("bash-changes ok");
