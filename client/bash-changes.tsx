import { highlightLine, isSyntaxThemeId, resolveSyntaxColors } from "@getpaseo/highlight";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import type { BashChanges } from "../shared/bash-changes";
import { parsePatch, type PatchFile, type PatchLine } from "./parse-patch";

type PluginTheme = PluginTimelineItemProps["theme"];
const mono = Platform.select({ ios: "Menlo", default: "monospace" });

/** The files a Bash call changed, drawn like Paseo's Edit diffs, right after the call. */
export function BashChangesRow({ item, theme }: PluginTimelineItemProps<BashChanges>) {
  const { files, fileCount, patch, truncated } = item.data;
  const parsed = useMemo(() => parsePatch(patch), [patch]);
  const counts = new Map(files.map((file) => [file.path, file]));
  const muted = { color: theme.colors.foregroundMuted };
  return (
    <View style={{ gap: 8 }}>
      <Text style={muted}>Bash changed {fileCount} {fileCount === 1 ? "file" : "files"}</Text>
      {parsed.map((file) => (
        <FileDiff key={file.path} file={file} counts={counts.get(file.path)} theme={theme} />
      ))}
      {truncated ? <Text style={muted}>Diff shortened. Run git diff to see all changes.</Text> : null}
    </View>
  );
}

function FileDiff({ file, counts, theme }: {
  file: PatchFile;
  counts?: { additions: number; deletions: number };
  theme: PluginTheme;
}) {
  const { colors } = theme;
  const syntax = resolveSyntaxColors(userSyntaxTheme(), isDark(colors.surface0) ? "dark" : "light");
  const width = String(file.lines.reduce((max, line) => Math.max(max, line.number ?? 0), 0)).length;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", gap: 8, padding: 6, backgroundColor: colors.surface1 }}>
        <Text style={{ flexShrink: 1, color: colors.foreground, fontFamily: mono, fontSize: 12 }}>{file.path}</Text>
        {counts ? <Text style={{ color: colors.statusSuccess, fontSize: 12 }}>+{counts.additions}</Text> : null}
        {counts ? <Text style={{ color: colors.statusDanger, fontSize: 12 }}>−{counts.deletions}</Text> : null}
      </View>
      {file.binary ? <Text style={{ padding: 6, color: colors.foregroundMuted }}>Binary file</Text> : (
        <ScrollView horizontal>
          <View style={{ minWidth: "100%" }}>
            {file.lines.map((line, index) => (
              <DiffLine key={index} line={line} path={file.path} width={width} syntax={syntax} theme={theme} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function DiffLine({ line, path, width, syntax, theme }: {
  line: PatchLine;
  path: string;
  width: number;
  syntax: Record<string, string>;
  theme: PluginTheme;
}) {
  const { colors } = theme;
  const text = { fontFamily: mono, fontSize: 12, lineHeight: 18 };
  if (line.kind === "hunk") {
    return <Text style={[text, { paddingHorizontal: 6, color: colors.foregroundMuted, backgroundColor: colors.surface1 }]}>⋯ {line.text}</Text>;
  }
  const tint = line.kind === "add" ? colors.statusSuccess : line.kind === "remove" ? colors.statusDanger : null;
  return (
    <View style={{ flexDirection: "row" }}>
      {/* An opaque layer at low opacity tints the row for any theme color format. */}
      {tint ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.14 }]} /> : null}
      <Text style={[text, { color: colors.foregroundMuted, paddingHorizontal: 6, textAlign: "right", minWidth: width * 8 + 12 }]}>
        {line.number}
      </Text>
      <Text style={[text, { width: 14, color: tint ?? colors.foregroundMuted }]}>
        {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
      </Text>
      <Text style={[text, { color: colors.foreground, paddingRight: 12 }]}>
        {highlightLine(line.text, path).map((token, index) => (
          <Text key={index} style={token.style ? { color: syntax[token.style] } : undefined}>{token.text}</Text>
        ))}
      </Text>
    </View>
  );
}

// shortcut: reads the app's private settings because PluginTheme omits syntax colors; switch to the
// theme prop if Paseo adds them (discussion #6600). iOS/Android have no localStorage and get the default.
function userSyntaxTheme() {
  try {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } }).localStorage;
    const id = JSON.parse(storage?.getItem("@paseo:app-settings") ?? "{}").syntaxTheme;
    return isSyntaxThemeId(id) ? id : "one"; // Paseo's default
  } catch {
    return "one";
  }
}

/** Paseo themes give hex surfaces; anything else is treated as dark. */
function isDark(color: string) {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return true;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}
