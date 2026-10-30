/**
 * The small Markdown subset the AI assistant's answers use, parsed into a tree the chat bubble
 * renders as React elements (never as HTML – the model's text cannot inject markup):
 * paragraphs, "#" headings, "-"/"*" and "1." lists, **bold**, *italic*, `code` and [links](/path).
 * Links are kept only for pages of this app ("/incidents/new") and https:// websites.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; internal: boolean; children: Inline[] };

export type Block =
  | { type: "paragraph"; lines: Inline[][] }
  | { type: "heading"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] };

/** "/incidents/new" → internal; "https://www.hsa.ie" → external; anything else (javascript:, mailto:, //host) → not a link. */
export function safeHref(raw: string): { href: string; internal: boolean } | null {
  const href = raw.trim();
  if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/\\")) return { href, internal: true };
  if (/^https:\/\/[^\s/]+\.[^\s]+$/i.test(href)) return { href, internal: false };
  return null;
}

const INLINE = /(\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ type: "text", text: rest });
      break;
    }
    if (match.index > 0) out.push({ type: "text", text: rest.slice(0, match.index) });
    const [whole, , bold1, bold2, code, linkText, linkHref, italic1, italic2] = match;
    if (bold1 !== undefined || bold2 !== undefined) out.push({ type: "bold", children: parseInline(bold1 ?? bold2) });
    else if (code !== undefined) out.push({ type: "code", text: code });
    else if (linkText !== undefined) {
      const safe = safeHref(linkHref);
      if (safe) out.push({ type: "link", ...safe, children: parseInline(linkText) });
      else out.push({ type: "text", text: linkText });
    } else out.push({ type: "italic", children: parseInline(italic1 ?? italic2) });
    rest = rest.slice(match.index + whole.length);
  }
  return mergeText(out);
}

function mergeText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const node of nodes) {
    const last = merged[merged.length - 1];
    if (node.type === "text" && last?.type === "text") last.text += node.text;
    else merged.push(node);
  }
  return merged;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: Extract<Block, { type: "list" }> | null = null;

  const close = () => {
    if (paragraph) blocks.push({ type: "paragraph", lines: paragraph });
    if (list) blocks.push(list);
    paragraph = null;
    list = null;
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      close();
      continue;
    }
    if (/^\s*(```|---+|\*\*\*+)\s*$/.test(line)) continue; // fences and rules carry no meaning here
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      blocks.push({ type: "heading", children: parseInline(heading[1]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        close();
        list = { type: "list", ordered, start: numbered ? Number(numbered[1]) : 1, items: [] };
      }
      list.items.push(parseInline(bullet ? bullet[1] : numbered![2]));
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      // An indented line continues the previous list item.
      const items = list.items;
      items[items.length - 1] = mergeText([...items[items.length - 1], { type: "text", text: " " }, ...parseInline(line.trim())]);
      continue;
    }
    if (list) close();
    paragraph ??= [];
    paragraph.push(parseInline(line.trim()));
  }
  close();
  return blocks;
}
