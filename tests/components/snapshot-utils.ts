// React/Radix generate ids such as "«r1»" or ":r1:" whose numbering depends on render order.
// Normalise them so snapshots only change when the visual markup changes.
const GENERATED_ID = /(?:radix-)?[«:]r[0-9a-z]+[»:]/g;
const ID_ATTRIBUTES = ["id", "for", "aria-controls", "aria-labelledby", "aria-describedby"];

export function normalizeGeneratedIds<T extends Node>(root: T): T {
  const clone = root.cloneNode(true) as T & ParentNode;
  clone.querySelectorAll("*").forEach((el) => {
    ID_ATTRIBUTES.forEach((attr) => {
      const value = el.getAttribute(attr);
      if (value) el.setAttribute(attr, value.replace(GENERATED_ID, "«id»"));
    });
  });
  return clone;
}
