// biome-ignore-all lint/suspicious/noArrayIndexKey: rendered once from static text; position is the identity
// Small markdown renderer for agent output (briefs, designs, reports). Builds React
// elements only — never HTML strings — so agent text cannot inject markup.
// Supports headings, paragraphs, bullet/numbered lists (one nesting level), code fences,
// tables, blockquotes, rules, and inline **bold**, *italic*, `code`.
import type { ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

interface Item {
  text: string;
  children: { ordered: boolean; items: string[] } | null;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  const k = () => `b${n++}`;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^```(\S*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) body.push(lines[i++] ?? "");
      i++;
      blocks.push(
        <pre key={k()} className="md-code">
          <code>{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min((h[1] ?? "#").length + 1, 6);
      const Tag = `h${level}` as "h2";
      const key = k();
      blocks.push(<Tag key={key}>{inline(h[2] ?? "", key)}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={k()} />);
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|"))
        rows.push(cells(lines[i++] ?? ""));
      const key = k();
      blocks.push(
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={`${key}h${j}`}>{inline(c, `${key}h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={`${key}r${ri}`}>
                  {r.map((c, j) => (
                    <td key={`${key}r${ri}c${j}`}>{inline(c, `${key}r${ri}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">"))
        body.push((lines[i++] ?? "").replace(/^>\s?/, ""));
      const key = k();
      blocks.push(<blockquote key={key}>{inline(body.join(" "), key)}</blockquote>);
      continue;
    }
    const lm = LIST.exec(line);
    if (lm) {
      const ordered = /\d/.test(lm[2] ?? "");
      const baseIndent = (lm[1] ?? "").length;
      const items: Item[] = [];
      while (i < lines.length) {
        const cur = lines[i] ?? "";
        const m = LIST.exec(cur);
        if (m && (m[1] ?? "").length <= baseIndent) {
          items.push({ text: m[3] ?? "", children: null });
        } else if (m) {
          const last = items[items.length - 1];
          if (last) {
            last.children ??= { ordered: /\d/.test(m[2] ?? ""), items: [] };
            last.children.items.push(m[3] ?? "");
          }
        } else if (cur.trim() && /^\s+/.test(cur) && items.length) {
          const last = items[items.length - 1];
          if (last) last.text += ` ${cur.trim()}`;
        } else break;
        i++;
      }
      const key = k();
      const L = ordered ? "ol" : "ul";
      blocks.push(
        <L key={key}>
          {items.map((it, j) => (
            <li key={`${key}i${j}`}>
              {inline(it.text, `${key}i${j}`)}
              {it.children &&
                (it.children.ordered ? (
                  <ol>
                    {it.children.items.map((c, ci) => (
                      <li key={`${key}i${j}c${ci}`}>{inline(c, `${key}i${j}c${ci}`)}</li>
                    ))}
                  </ol>
                ) : (
                  <ul>
                    {it.children.items.map((c, ci) => (
                      <li key={`${key}i${j}c${ci}`}>{inline(c, `${key}i${j}c${ci}`)}</li>
                    ))}
                  </ul>
                ))}
            </li>
          ))}
        </L>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? "";
      if (!cur.trim() || /^(#{1,6}\s|```|>|\s*\|)/.test(cur) || LIST.test(cur)) break;
      para.push(cur.trim());
      i++;
    }
    const key = k();
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
