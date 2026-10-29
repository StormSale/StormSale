// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Keypair } from "@stellar/stellar-sdk";

const stellarMocks = vi.hoisted(() => ({
  resolveFederatedAddress: vi.fn(),
}));

vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, resolveFederatedAddress: stellarMocks.resolveFederatedAddress };
});

import { FederatedAddressInput } from "../components/shared/FederatedAddressInput";
import type { RecipientResolution } from "../lib/stellar";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_KEY = Keypair.random().publicKey();
const FEDERATED_KEY = Keypair.random().publicKey();

let container: HTMLDivElement;
let root: Root;
let resolutions: (RecipientResolution | null)[] = [];

const Harness = ({ initial = "" }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <FederatedAddressInput
      value={value}
      onChange={setValue}
      onResolved={(resolution) => resolutions.push(resolution)}
      debounceMs={1}
    />
  );
};

function input(): HTMLInputElement {
  return container.querySelector("input")!;
}

async function settle(ms = 15) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function type(value: string) {
  const el = input();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function render(initial = "") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness initial={initial} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolutions = [];
  stellarMocks.resolveFederatedAddress.mockResolvedValue({
    accountId: FEDERATED_KEY,
    federatedAddress: "alice*stormsale.io",
    memoType: "id",
    memo: "1001",
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
});

describe("FederatedAddressInput interactions", () => {
  it("recognizes a raw public key without a lookup", async () => {
    await render(PUBLIC_KEY);

    expect(container.textContent).toContain("Verified Stellar public key");
    expect(stellarMocks.resolveFederatedAddress).not.toHaveBeenCalled();
    expect(resolutions.at(-1)).toEqual({ status: "raw", address: PUBLIC_KEY });
  });

  it("resolves a federation address and exposes the memo", async () => {
    await render();

    await type("alice*stormsale.io");
    await settle();
    expect(stellarMocks.resolveFederatedAddress).toHaveBeenCalledWith("alice*stormsale.io");
    expect(container.textContent).toContain("Resolved alice*stormsale.io");
    expect(container.textContent).toContain("1001");
    expect(resolutions.at(-1)).toMatchObject({
      status: "federated",
      address: FEDERATED_KEY,
      memoType: "id",
      memo: "1001",
    });
  });

  it("reports lookup failures and suggests a raw key", async () => {
    stellarMocks.resolveFederatedAddress.mockRejectedValue(new Error("HTTP 503"));

    await render();
    await type("alice*stormsale.io");
    await settle();

    expect(container.textContent).toContain("Federation lookup failed (HTTP 503)");
    expect(resolutions.at(-1)).toMatchObject({ status: "unresolved", error: "HTTP 503" });
  });

  it("flags invalid input", async () => {
    await render();
    await type("not-an-address");

    expect(container.textContent).toContain("Enter a valid G... public key");
    expect(resolutions.at(-1)).toMatchObject({ status: "invalid" });
  });

  it("ignores a stale lookup when the value is retyped", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    stellarMocks.resolveFederatedAddress
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(async () => ({
        accountId: FEDERATED_KEY,
        federatedAddress: "bob*stormsale.io",
      }));

    await render();
    await type("alice*stormsale.io");
    await settle();
    await type("bob*stormsale.io");
    await settle();

    await act(async () => {
      resolveFirst({ accountId: PUBLIC_KEY, federatedAddress: "alice*stormsale.io" });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Resolved bob*stormsale.io");
    expect(container.textContent).not.toContain("Resolved alice*stormsale.io");
  });

  it("renders the status message in a polite live region", async () => {
    await render(PUBLIC_KEY);
    const liveRegion = container.querySelector('[role="status"]');
    expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
    expect(liveRegion?.textContent).toContain("Verified Stellar public key");
  });
});
