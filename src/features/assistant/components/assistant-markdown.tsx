"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/assistant/markdown";

/** Renders an answer's Markdown subset as React elements (no HTML from the model ever reaches the page). */
export function AssistantMarkdown({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function BlockView({ block, onNavigate }: { block: Block; onNavigate?: () => void }) {
  if (block.type === "heading") {
    return (
      <p className="font-semibold">
        <Inlines nodes={block.children} onNavigate={onNavigate} />
      </p>
    );
  }
  if (block.type === "list") {
    const items = block.items.map((item, i) => (
      <li key={i} className="pl-1">
        <Inlines nodes={item} onNavigate={onNavigate} />
      </li>
    ));
    return block.ordered ? (
      <ol start={block.start} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
        {items}
      </ol>
    ) : (
      <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground">{items}</ul>
    );
  }
  return (
    <p>
      {block.lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Inlines nodes={line} onNavigate={onNavigate} />
        </Fragment>
      ))}
    </p>
  );
}

const linkClass = "font-medium text-brand underline underline-offset-2 hover:text-brand-dark dark:hover:text-brand-light";

function Inlines({ nodes, onNavigate }: { nodes: Inline[]; onNavigate?: () => void }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <Fragment key={i}>{node.text}</Fragment>;
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <Inlines nodes={node.children} onNavigate={onNavigate} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <Inlines nodes={node.children} onNavigate={onNavigate} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-background/70 px-1 py-0.5 text-[0.85em]">
                {node.text}
              </code>
            );
          case "link":
            return node.internal ? (
              <Link key={i} href={node.href} className={linkClass} onClick={onNavigate}>
                <Inlines nodes={node.children} />
              </Link>
            ) : (
              <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <Inlines nodes={node.children} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            );
        }
      })}
    </>
  );
}
