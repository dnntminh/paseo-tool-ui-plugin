import type { PluginClientContext } from "@getpaseo/plugin/client";
import { autoExpandEdits } from "./client/auto-expand";
import { BashChangesRow } from "./client/bash-changes";
import { bashChangesKind, bashChangesSchema } from "./shared/bash-changes";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({ kind: bashChangesKind, version: 1, schema: bashChangesSchema, Component: BashChangesRow });
  return autoExpandEdits();
}
