/**
 * Convert the small subset of Obsidian/Markdown syntax that commonly appears in
 * vault previews into readable Horizon text. The vault keeps its original Markdown;
 * this is only for display surfaces that intentionally show prose, not a full renderer.
 */
export function normalizeVaultText(value: string): string {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s)\]},.!?:;])/gm, "$1$2")
    .replace(/(^|[\s([{])_([^_\n]+)_(?=$|[\s)\]},.!?:;(])/gm, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\r?\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
