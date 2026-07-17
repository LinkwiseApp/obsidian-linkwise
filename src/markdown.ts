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
 * Remove the server-rendered "Saved from <source>" banner from a managed body.
 *
 * The banner is an Obsidian callout (`> [!info] Saved from …`) the server renders
 * at the top of the managed region. Matches that callout — its first line plus any
 * `>` continuation lines — then collapses the blank gap it leaves behind so the
 * summary starts cleanly. Anything else in the managed body is untouched.
 */
export function stripSavedFromBanner(managed: string): string {
  return managed
    .replace(/^[ \t]*>[^\n]*\bSaved from\b[^\n]*(?:\n[ \t]*>[^\n]*)*\n?/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*\n/, "");
}

/** Tag stamped on every MOC note — the anchor for the graph color group. */
export const MOC_TAG = "linkwise/moc";

/** Basename (no extension) of a collection's Map of Content note. */
export function mocBaseName(collection: string): string {
  return `🗺️ ${collection}`;
}

/**
 * A Map of Content for one collection: a fully Linkwise-managed index note that
 * wikilinks every synced link in the collection. Regenerated wholesale each sync
 * (it carries no user content), and marked so the indexer skips it.
 *
 * The note is deliberately styled to stand apart from the links it indexes: the
 * filename carries a `🗺️` map marker, a callout summarizes the link count, and the
 * `linkwise/moc` tag lets the "Set up graph colors" command paint it a distinct
 * color. The note title comes from the filename, so there is no redundant heading.
 */
export function buildMOC(collection: string, noteBaseNames: string[]): string {
  const sorted = [...noteBaseNames].sort((a, b) => a.localeCompare(b));
  const links = sorted.map((n) => `- [[${wikilinkTarget(n)}]]`).join("\n");
  const count = sorted.length;
  const body = count > 0 ? links : "_No links yet._";
  const countLabel = count === 1 ? "1 link" : `${count} links`;
  return [
    "---",
    "linkwise_moc: true",
    `collection: ${JSON.stringify(collection)}`,
    `tags: [${MOC_TAG}]`,
    "---",
    "",
    "> [!info] Map of Content",
    `> Index of the **${collection}** collection — ${countLabel}.`,
    "",
    body,
    "",
  ].join("\n");
}
