// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeGeneratedIds } from "./snapshot-utils";

const fromHtml = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("normalizeGeneratedIds", () => {
  it("maps an id and its references to the same token", () => {
    const root = fromHtml(
      '<div role="dialog" aria-labelledby="«r1»" aria-describedby="«r2»">' +
        '<h2 id="«r1»">Title</h2><p id="«r2»">Body</p></div>',
    );
    const out = normalizeGeneratedIds(root) as HTMLElement;

    expect(out.querySelector("h2")!.id).toBe("«id-1»");
    expect(out.querySelector("p")!.id).toBe("«id-2»");
    expect(out.firstElementChild!.getAttribute("aria-labelledby")).toBe("«id-1»");
    expect(out.firstElementChild!.getAttribute("aria-describedby")).toBe("«id-2»");
  });

  it("keeps distinct ids distinct so a broken reference is visible", () => {
    const linked = normalizeGeneratedIds(
      fromHtml('<label for="«r1»">A</label><input id="«r1»">'),
    ) as HTMLElement;
    const broken = normalizeGeneratedIds(
      fromHtml('<label for="«r1»">A</label><input id="«r2»">'),
    ) as HTMLElement;

    expect(linked.innerHTML).not.toBe(broken.innerHTML);
  });

  it("produces the same output regardless of the generated numbering", () => {
    const a = normalizeGeneratedIds(fromHtml('<h2 id="«r1»"></h2><p aria-labelledby="«r1»"></p>'));
    const b = normalizeGeneratedIds(fromHtml('<h2 id="«r9»"></h2><p aria-labelledby="«r9»"></p>'));

    expect((a as HTMLElement).innerHTML).toBe((b as HTMLElement).innerHTML);
  });

  it("handles radix- prefixed ids and leaves other values and the input untouched", () => {
    const root = fromHtml('<button id="radix-«r3»" class="x" aria-controls="static-id"></button>');
    const out = normalizeGeneratedIds(root) as HTMLElement;
    const btn = out.querySelector("button")!;

    expect(btn.id).toBe("«id-1»");
    expect(btn.className).toBe("x");
    expect(btn.getAttribute("aria-controls")).toBe("static-id");
    expect(root.querySelector("button")!.id).toBe("radix-«r3»");
  });

  it("normalizes the React 19 underscore id format", () => {
    const root = fromHtml(
      '<div aria-labelledby="radix-_r_7_" aria-describedby="radix-_r_8_"></div><h2 id="radix-_r_7_"></h2>',
    );
    const out = normalizeGeneratedIds(root) as HTMLElement;

    expect(out.querySelector("h2")!.id).toBe("«id-1»");
    expect(out.firstElementChild!.getAttribute("aria-labelledby")).toBe("«id-1»");
    expect(out.firstElementChild!.getAttribute("aria-describedby")).toBe("«id-2»");
  });
});
