/**
 * A tiny XML builder whose output is already in W3C Canonical XML (C14N 1.0) form — no
 * declaration, no insignificant whitespace, attributes sorted, C14N escaping — because the
 * IRmark HMRC checks is a SHA-1 of the canonicalised <Body>. Building canonical output
 * directly avoids needing a C14N library; tests confirm it against xmllint --c14n.
 */

export type XmlNode = { name: string; attrs: Record<string, string>; children: Array<XmlNode | string> };

export function el(name: string, attrsOrChildren?: Record<string, string | undefined> | Array<XmlNode | string | null | undefined | false> | string | number, maybeChildren?: Array<XmlNode | string | null | undefined | false> | string | number): XmlNode {
  let attrs: Record<string, string | undefined> = {};
  let children: unknown = maybeChildren;
  if (Array.isArray(attrsOrChildren) || typeof attrsOrChildren === "string" || typeof attrsOrChildren === "number") children = attrsOrChildren;
  else if (attrsOrChildren) attrs = attrsOrChildren;
  const list = (Array.isArray(children) ? children : children === undefined ? [] : [String(children)]).filter(
    (c): c is XmlNode | string => c !== null && c !== undefined && c !== false
  );
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) clean[k] = v;
  return { name, attrs: clean, children: list };
}

/** Element only when there's a value to put in it — optional XML items. */
export function opt(name: string, value: string | number | null | undefined, attrs?: Record<string, string | undefined>): XmlNode | null {
  if (value === null || value === undefined || value === "") return null;
  return el(name, attrs ?? {}, String(value));
}

const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
const escAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");

/** C14N attribute order: namespace declarations first (default, then by prefix), then attributes by name. */
function sortedAttrs(attrs: Record<string, string>): Array<[string, string]> {
  const entries = Object.entries(attrs);
  const ns = entries.filter(([k]) => k === "xmlns" || k.startsWith("xmlns:")).sort(([a], [b]) => (a === "xmlns" ? -1 : b === "xmlns" ? 1 : a < b ? -1 : 1));
  const rest = entries.filter(([k]) => !(k === "xmlns" || k.startsWith("xmlns:"))).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return [...ns, ...rest];
}

export function serialize(node: XmlNode | string): string {
  if (typeof node === "string") return escText(node);
  const attrs = sortedAttrs(node.attrs)
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
  return `<${node.name}${attrs}>${node.children.map(serialize).join("")}</${node.name}>`;
}

/** Money as HMRC expects: two decimal places, no separators. */
export const money = (pounds: number) => (Math.round(pounds * 100) / 100).toFixed(2);
