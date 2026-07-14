// Markdown composition & the heading-boundary merge that makes sync local-first.
//
// The server hands us each note pre-rendered as frontmatter + a "managed" body
// (the source callout, summary and highlights). Linkwise owns the YAML
// frontmatter and everything ABOVE the user-notes heading; everything from that
// heading down is the user's and is preserved verbatim across re-syncs. There
// are no visible marker comments — the `## My notes` heading is the divider.

/** The heading that separates Linkwise-managed content (above) from the user's (below). */
export const USER_SECTION_HEADING = "## My notes";

/** Matches the user-notes heading on its own line (tolerant of case & trailing space). */
const USER_SECTION_RE = /^##\s+My notes\s*$/im;

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;

/**
 * Build the full note text.
 *
 * - No `existing` → a fresh note: frontmatter + managed content + an empty
 *   "## My notes" section for the user.
 * - `existing` present → rewrite the frontmatter and everything above the
 *   `## My notes` heading, preserving that heading and all content below it. If
 *   the user removed/renamed the heading, their whole body is preserved beneath
 *   a freshly re-inserted `## My notes` divider (nothing is ever destroyed).
 */
export function composeNote(frontmatter: string, managed: string, existing?: string | null): string {
  const body = managed.trim();
  const freshNote = `${frontmatter}\n\n${body}\n\n${USER_SECTION_HEADING}\n\n`;

  if (!existing || existing.trim().length === 0) {
    return freshNote;
  }

  // Strip any existing frontmatter — we always rewrite it.
  const rest = existing.replace(FRONTMATTER_RE, "");
  const match = USER_SECTION_RE.exec(rest);

  if (match) {
    // Everything from the `## My notes` heading onward belongs to the user.
    const userPart = rest.slice(match.index).replace(/\s+$/, "");
    return `${frontmatter}\n\n${body}\n\n${userPart}\n`;
  }

  // Divider missing (user renamed/removed it) — keep their text, re-add the divider.
  const preserved = rest.trim();
  if (preserved.length === 0) return freshNote;
  return `${frontmatter}\n\n${body}\n\n${USER_SECTION_HEADING}\n\n${preserved}\n`;
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
