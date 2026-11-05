#!/bin/sh
# install:   adds the Claude Code hooks for Bash diffs. Paseo runs it from paseo-plugin.json "build"
#            on every plugin install and update, so `paseo plugin add` sets everything up.
# uninstall: removes the hooks and the plugin, since `paseo plugin remove` runs no plugin code:
#   curl -fsSL https://raw.githubusercontent.com/dnntminh/paseo-tool-ui-plugin/main/hooks/setup.sh | sh -s uninstall
# Other settings in ~/.claude/settings.json are kept, and running install twice changes nothing.
set -eu
mode=${1:-}
[ "$mode" = install ] || [ "$mode" = uninstall ] || { echo "usage: setup.sh install|uninstall" >&2; exit 2; }
id=paseo-tool-ui-plugin
script="$HOME/.claude/hooks/paseo-tool-ui-snapshot.sh"
settings="$HOME/.claude/settings.json"
# Exits quietly when the script is gone, so leftover settings never break Claude.
command="[ -x '$script' ] && '$script' || true"

if [ "$mode" = install ]; then
  # A missing tool skips only the Bash diffs; failing here would block the whole plugin install.
  for tool in jq git; do
    command -v "$tool" >/dev/null || { echo "$id: $tool not found, Bash diffs disabled" >&2; exit 0; }
  done
  mkdir -p "$(dirname "$script")"
  cp "$(dirname "$0")/paseo-tool-ui-snapshot.sh" "$script"
  chmod +x "$script"
  [ -f "$settings" ] || echo '{}' > "$settings"
fi

if [ -f "$settings" ]; then
  cp "$settings" "$settings.bak"
  jq --arg c "$command" --arg mode "$mode" '
    .hooks = ((.hooks // {})
      | with_entries(.value |= map(select(any(.hooks[]?; .command == $c) | not)))
      | with_entries(select(.value != [])))
    | if $mode == "install" then
        reduce ("PreToolUse", "PostToolUse", "PostToolUseFailure") as $e (.;
          .hooks[$e] += [{matcher: "Bash", hooks: [{type: "command", command: $c, timeout: 10}]}])
      else . end
    | if .hooks == {} then del(.hooks) else . end
  ' "$settings.bak" > "$settings.tmp"
  # cat keeps a symlinked or permission-restricted settings.json in place; jq succeeded above.
  cat "$settings.tmp" > "$settings"
  rm -f "$settings.tmp"
fi

if [ "$mode" = uninstall ]; then
  rm -f "$script"
  rmdir "$(dirname "$script")" 2>/dev/null || true # only when nothing else lives there
  # </dev/null: when piped from curl, stdin is this script and must not be read by paseo.
  if command -v paseo >/dev/null && paseo plugin ls "$id" --json </dev/null 2>/dev/null | grep -q '"path"'; then
    paseo plugin remove "$id" </dev/null
  fi
fi
echo "$id: $mode done (settings backup: $settings.bak)"
