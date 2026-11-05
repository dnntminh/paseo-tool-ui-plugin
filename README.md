# paseo-tool-ui-plugin

Automatically expands Paseo's native **Edit** and **Write** tool cards on desktop
and web, so their existing file details and diffs are visible.

Claude Code also changes files through **Bash** (`sed -i`, scripts, formatters),
which no Edit card shows. With the optional Claude hooks installed, the plugin adds
a **Bash changed N files** row with the diff right after each Bash call that
changed files.

Paseo provides the Edit and Write rendering; the plugin only clicks their existing
expansion controls. Reads, searches, and other tools keep their usual behavior.

Click a header to collapse a card. Streaming updates respect that choice while
the card remains mounted.

## Install

Requires Paseo with plugin support on both the daemon and client, and `jq` and
`git` on the daemon host. Run on the daemon host:

```sh
curl -fsSL https://raw.githubusercontent.com/dnntminh/paseo-tool-ui-plugin/main/hooks/setup.sh | sh -s install
```

This adds the plugin from GitHub (Paseo manages its own copy) and the Claude Code
hooks for Bash changes. To remove both:

```sh
curl -fsSL https://raw.githubusercontent.com/dnntminh/paseo-tool-ui-plugin/main/hooks/setup.sh | sh -s uninstall
```

In Paseo's appearance settings, select **Tool call display → Full detail** to
show individual tool cards.

### Bash changes (Claude only)

The install command copies `paseo-tool-ui-snapshot.sh` to `~/.claude/hooks/` and adds a
`PreToolUse`, `PostToolUse` and `PostToolUseFailure` hook for Bash to
`~/.claude/settings.json`, keeping your other settings (backup in
`settings.json.bak`). Running it again changes nothing.

The hooks never change what Claude does: they print nothing, always exit 0, and
do nothing outside agents this plugin opened. Inside those, they record the
worktree as a git tree before and after each Bash call, using a temporary index
so your staging area is untouched. The plugin diffs the two trees.

Uninstall leaves behind, all harmless: `settings.json.bak`, event logs in
`$TMPDIR/paseo-tool-ui/`, and snapshot objects in each repository's `.git` that
`git gc` prunes.

Limits:

- Only git repositories; files ignored by `.gitignore` are not shown.
- Changes by background processes (dev servers, watchers) land on whichever
  Bash call is running when they happen.
- Large diffs are shortened to fit Paseo's 64 KiB timeline row limit.
- Syntax colors follow your **Syntax theme** setting on desktop and web; iOS and
  Android use Paseo's default, since plugins can't read that setting there.
- Rows live in the daemon's memory and disappear when it restarts.
- Agents opened before the plugin started pick up the hooks when Paseo reopens them.

To disable automatic expansion:

```sh
paseo plugin disable paseo-tool-ui-plugin
```

To enable it again:

```sh
paseo plugin enable paseo-tool-ui-plugin
```

## Compatibility

- Works with any coding-agent provider whose native cards are labeled **Edit** or **Write**.
- Applies only to visible cards in desktop/web layouts at least 720px wide.
  Mobile and narrower layouts keep their usual tool-sheet behavior.
- Cards can expand again when Paseo unmounts and remounts them, such as during scrolling.

The plugin observes the page and clicks native tool headers, so changes to
Paseo's DOM structure or labels
may require an update. It registers no custom tool renderer or timeline transformer
for them.

## Develop

For development, clone the repository and run from its root directory:

```sh
npm ci
npm run typecheck
npm test
paseo plugin add "$PWD"
paseo plugin reload paseo-tool-ui-plugin
```

Reload after editing an installed local copy. The tests cover Edit/Write
selection, manual collapse, incoming and hidden cards, compact layouts, and cleanup,
plus the snapshot hook, the Bash diff, and hook install/uninstall.
There are no runtime dependencies or separate build steps.

## License

[MIT](LICENSE)
