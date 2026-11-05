#!/bin/sh
# Claude Code hook for paseo-tool-ui-plugin: records a git tree snapshot before and after each
# Bash call. It always exits 0 and prints nothing, so Claude never sees it.
input=$(cat) # read stdin even when inactive, so Claude never hits a broken pipe
[ -n "${PASEO_TOOL_UI_EVENTS:-}" ] || exit 0 # set only for agents the plugin opened
cd "$(printf %s "$input" | jq -r '.cwd // empty')" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
tmp=$(mktemp -d) || exit 0
# A copy of the real index keeps git's stat cache, so add -A only hashes changed files.
cp "$(git rev-parse --git-path index)" "$tmp/index" 2>/dev/null
tree=$(GIT_INDEX_FILE="$tmp/index" git add -A >/dev/null 2>&1 && GIT_INDEX_FILE="$tmp/index" git write-tree 2>/dev/null)
rm -rf "$tmp"
printf %s "$input" | jq -c --arg tree "$tree" --arg cwd "$PWD" \
  '{id: .tool_use_id, event: .hook_event_name, tree: $tree, cwd: $cwd}' >> "$PASEO_TOOL_UI_EVENTS" 2>/dev/null
exit 0
