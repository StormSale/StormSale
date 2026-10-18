// React/Radix generate ids such as "«r1»", ":r1:" or "_r_1_" (React 19) whose numbering depends on render order.
// Replace each distinct id with a stable token ("«id-1»", "«id-2»", ...) numbered by first
// appearance. Snapshots then only change when the markup changes, while a broken link between an
// element and its reference (aria-labelledby, for, ...) still shows up as a different token.
const GENERATED_ID = /(?:radix-)?(?:[«:]r[0-9a-z]+[»:]|_r_[0-9a-z]+_)/g;
const ID_ATTRIBUTES = ["id", "for", "aria-controls", "aria-labelledby", "aria-describedby"];

export function normalizeGeneratedIds<T extends Node>(root: T): T {
  const clone = root.cloneNode(true) as T & ParentNode;
  const tokens = new Map<string, string>();
  const tokenFor = (generated: string) => {
    if (!tokens.has(generated)) tokens.set(generated, `«id-${tokens.size + 1}»`);
    return tokens.get(generated)!;
  };

  clone.querySelectorAll("*").forEach((el) => {
    ID_ATTRIBUTES.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, value.replace(GENERATED_ID, tokenFor));
    });
  });
  return clone;
}
