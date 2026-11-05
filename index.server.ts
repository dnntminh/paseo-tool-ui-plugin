import type { PluginServerContext } from "@getpaseo/plugin/server";
import { contributeBashChanges } from "./server/bash-changes";

export default function contribute(server: PluginServerContext) {
  return contributeBashChanges(server);
}
