#!/bin/sh
# Installs or removes the whole plugin: the Paseo plugin plus the Claude Code hooks it needs.
#   curl -fsSL https://raw.githubusercontent.com/dnntminh/paseo-tool-ui-plugin/main/hooks/setup.sh | sh -s install
#   curl -fsSL https://raw.githubusercontent.com/dnntminh/paseo-tool-ui-plugin/main/hooks/setup.sh | sh -s uninstall
# Other settings in ~/.claude/settings.json are kept, and running install twice changes nothing.
set -eu
mode=${1:-}
[ "$mode" = install ] || [ "$mode" = uninstall ] || { echo "usage: setup.sh install|uninstall" >&2; exit 2; }
for tool in paseo jq git; do
  command -v "$tool" >/dev/null || { echo "setup.sh: $tool is required" >&2; exit 1; }
done
id=paseo-tool-ui-plugin
script="$HOME/.claude/hooks/paseo-tool-ui-snapshot.sh"
settings="$HOME/.claude/settings.json"
# Exits quietly when the script is gone, so leftover settings never break Claude.
command="[ -x '$script' ] && '$script' || true"
# </dev/null: when piped from curl, stdin is this script and must not be read by paseo.
plugin_dir() { paseo plugin ls "$id" --json </dev/null 2>/dev/null | jq -r '.[0].path // empty' 2>/dev/null || true; }

if [ "$mode" = install ]; then
  [ -n "$(plugin_dir)" ] || paseo plugin add https://github.com/dnntminh/paseo-tool-ui-plugin.git </dev/null
  dir=$(plugin_dir)
  [ -n "$dir" ] || { echo "setup.sh: $id did not install" >&2; exit 1; }
  mkdir -p "$(dirname "$script")"
  cp "$dir/hooks/paseo-tool-ui-snapshot.sh" "$script"
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
  [ -z "$(plugin_dir)" ] || paseo plugin remove "$id" </dev/null
fi
echo "$id: $mode done (settings backup: $settings.bak)"
