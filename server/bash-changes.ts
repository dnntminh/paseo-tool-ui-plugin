import { mkdirSync, readdirSync, statSync, watch } from "node:fs";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { bashChangesKind } from "../shared/bash-changes";
import { diffSnapshots, type Snapshot } from "./snapshot-diff";

type PaseoApi = Parameters<Parameters<PluginServerContext["addHook"]>[1]>[1]["paseo"];

const eventsDir = join(tmpdir(), "paseo-tool-ui");
const eventsFile = (agentId: string) => join(eventsDir, `${agentId}.jsonl`);

/**
 * Shows what each Claude Bash call changed on disk. The Claude Code hook in hooks/ snapshots the
 * worktree around every Bash call into a per-agent events file; this reads the file, diffs each
 * call's two snapshots, and appends the diff to the agent's timeline.
 */
export function contributeBashChanges(server: PluginServerContext) {
  mkdirSync(eventsDir, { recursive: true });
  let paseo: PaseoApi | undefined; // one API per plugin process, handed to every hook
  // Start after existing events so a plugin restart doesn't replay old calls at the timeline's end.
  const offsets = new Map(readdirSync(eventsDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => [basename(name, ".jsonl"), statSync(join(eventsDir, name)).size]));
  // shortcut: a Bash call interrupted before PostToolUse leaves its entry here; fine until agents run for weeks.
  const pending = new Map<string, Snapshot>();
  let queue = Promise.resolve();

  const drain = async (agentId: string) => {
    const handle = await open(eventsFile(agentId), "r").catch(() => null);
    if (!handle || !paseo) return;
    try {
      const offset = offsets.get(agentId) ?? 0;
      const { size } = await handle.stat();
      if (size <= offset) return;
      const { buffer } = await handle.read(Buffer.alloc(size - offset), 0, size - offset, offset);
      const end = buffer.lastIndexOf(10) + 1; // leave a half-written line for the next read
      offsets.set(agentId, offset + end);
      for (const line of buffer.subarray(0, end).toString().split("\n").filter(Boolean)) {
        const snapshot = JSON.parse(line) as Snapshot;
        if (snapshot.event === "PreToolUse") {
          pending.set(snapshot.id, snapshot);
          continue;
        }
        const before = pending.get(snapshot.id);
        pending.delete(snapshot.id);
        const changes = before && (await diffSnapshots(before, snapshot));
        if (!changes) continue;
        await paseo.agents.ref(agentId).timeline.append({
          type: "plugin",
          id: `${bashChangesKind}-${snapshot.id}`,
          kind: bashChangesKind,
          version: 1,
          data: { ...changes },
        });
      }
    } finally {
      await handle.close();
    }
  };
  const enqueue = (agentId: string) => {
    queue = queue.then(() => drain(agentId)).catch((error) => console.error("[bash-changes]", error));
  };

  const watcher = watch(eventsDir, (_, name) => {
    if (name?.endsWith(".jsonl")) enqueue(basename(name, ".jsonl"));
  });

  server.addHook("agent.open.before", async ({ request }, context) => {
    paseo = context.paseo;
    if (request.provider !== "claude") return;
    return { ...request, env: { ...request.env, PASEO_TOOL_UI_EVENTS: eventsFile(request.agentId) } };
  });
  server.addHook("agent.close.after", async ({ agent }) => {
    offsets.delete(agent.id);
    await rm(eventsFile(agent.id), { force: true });
  });

  return () => watcher.close();
}
