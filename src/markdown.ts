// Markdown composition & the fenced-region merge that makes sync local-first.
//
// The server hands us each note pre-rendered as frontmatter + a "managed" body.
// Linkwise only ever owns the YAML frontmatter and the text BETWEEN the fence
// markers; everything the user writes outside that fence is preserved verbatim
// across re-syncs. These markers MUST stay byte-identical to the server copy in
// _shared/obsidian-markdown.ts.

export const FENCE_START = "%% linkwise:start %%";
export const FENCE_END = "%% linkwise:end %%";

/** Scaffolded once, below the fence, on first create. Never touched again. */
const DEFAULT_TAIL = "## My notes\n\n";

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

function fencedBlock(managed: string): string {
  return `${FENCE_START}\n${managed}\n${FENCE_END}`;
}

/**
 * Build the full note text.
 *
 * - No `existing` → a fresh note: frontmatter + managed fence + an empty
 *   "My notes" section for the user.
 * - `existing` present → replace the frontmatter and the fenced region only,
 *   keeping any content the user added before or after the fence. If the user
 *   removed the fence entirely, it is re-inserted above their body.
 */
export function composeNote(frontmatter: string, managed: string, existing?: string | null): string {
  const block = fencedBlock(managed);

  if (!existing || existing.trim().length === 0) {
    return `${frontmatter}\n\n${block}\n\n${DEFAULT_TAIL}`;
  }

  // Strip any existing frontmatter — we always rewrite it.
  let rest = existing.replace(FRONTMATTER_RE, "");

  const start = rest.indexOf(FENCE_START);
  const end = rest.indexOf(FENCE_END);

  if (start !== -1 && end !== -1 && end > start) {
    const before = rest.slice(0, start).replace(/\s+$/, "");
    const after = rest.slice(end + FENCE_END.length).replace(/^\s+/, "");
    const middle = [before, block].filter((s) => s.length > 0).join("\n\n");
    const tail = after.length > 0 ? `\n\n${after}` : `\n\n${DEFAULT_TAIL}`;
    return `${frontmatter}\n\n${middle}${tail}`;
  }

  // Fence missing (user deleted it) — re-add it above their body.
  const body = rest.replace(/^\s+/, "");
  const tail = body.length > 0 ? `\n\n${body}` : `\n\n${DEFAULT_TAIL}`;
  return `${frontmatter}\n\n${block}${tail}`;
}

/** Escape a wikilink target so pipes/brackets in a title don't break the link. */
export function wikilinkTarget(fileBaseName: string): string {
  return fileBaseName.replace(/[[\]|#^]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A Map of Content for one collection: a fully Linkwise-managed index note that
 * wikilinks every synced note in the collection. Regenerated wholesale each sync
 * (it carries no user content), and marked so the indexer skips it.
 */
export function buildMOC(collection: string, noteBaseNames: string[]): string {
  const sorted = [...noteBaseNames].sort((a, b) => a.localeCompare(b));
  const links = sorted.map((n) => `- [[${wikilinkTarget(n)}]]`).join("\n");
  const body = links.length > 0 ? links : "_No notes yet._";
  return [
    "---",
    "linkwise_moc: true",
    `collection: ${JSON.stringify(collection)}`,
    "---",
    "",
    `# ${collection}`,
    "",
    body,
    "",
  ].join("\n");
}
