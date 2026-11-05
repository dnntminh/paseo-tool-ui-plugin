#!/bin/sh
# Usage: sh hooks/claude-hooks.sh install|uninstall
# Adds or removes the Bash snapshot hooks in ~/.claude/settings.json. Other settings are kept,
# and running install twice adds the hooks once.
set -eu
mode=${1:-}
[ "$mode" = install ] || [ "$mode" = uninstall ] || { echo "usage: $0 install|uninstall" >&2; exit 2; }
script="$HOME/.claude/hooks/paseo-tool-ui-snapshot.sh"
settings="$HOME/.claude/settings.json"
# Exits quietly when the script is gone, so leftover settings never break Claude.
command="[ -x '$script' ] && '$script' || true"

if [ "$mode" = install ]; then
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

[ "$mode" = uninstall ] && rm -f "$script"
echo "paseo-tool-ui hooks: ${mode} done (backup: $settings.bak)"
