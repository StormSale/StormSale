import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { Auditor } from "../pages/Auditor";
import { Web3Provider } from "../context/Web3Context";

const captured = vi.hoisted(() => ({
  onTabChange: undefined as undefined | ((tab: string) => void),
  onViewMerkleProof: undefined as undefined | ((saleId: string) => void),
}));

vi.mock("../components/shared/Sidebar", () => ({
  Sidebar: (props: { tabs: { id: string; label: string }[]; onTabChange: (t: string) => void }) => {
    captured.onTabChange = props.onTabChange;
    return (
      <nav>
        {props.tabs.map((t) => (
          <span key={t.id}>{t.label}</span>
        ))}
      </nav>
    );
  },
}));

vi.mock("../components/auditor/AuditHistory", () => ({
  AuditHistory: (props: { onViewMerkleProof: (id: string) => void }) => {
    captured.onViewMerkleProof = props.onViewMerkleProof;
    return <div>Audit history</div>;
  },
}));

const TAB_KEY = "stormsale.auditor.tab";

const createStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  } as Storage;
};

const renderAuditorOnTab = (tab: string) => {
  localStorage.setItem(TAB_KEY, JSON.stringify({ v: 1, value: tab }));
  return renderToString(
    <Web3Provider>
      <Auditor onBack={() => {}} />
    </Web3Provider>,
  );
};

describe("Auditor page — Financial Volume tab (#61)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the Financial Volume tab in the sidebar", () => {
    const html = renderAuditorOnTab("overview");
    expect(html).toContain("Financial Volume");
    expect(html).toContain("Organization scope");
  });

  it("renders the platform volume widget on the volume tab", () => {
    const html = renderAuditorOnTab("volume");
    expect(html).toContain("Platform Financial Volume");
    expect(html).toContain("Total Escrow Volume");
    expect(html).toContain("Volume growth trend");
  });

  it.each(["verify", "history", "compliance", "network", "soc2", "privacy", "merkle"])(
    "still renders the %s tab",
    (tab) => {
      const html = renderAuditorOnTab(tab);
      expect(html).toContain("Organization scope");
      expect(html).not.toContain("Platform Financial Volume");
    },
  );

  it("only switches to known tabs and opens merkle proofs from history", () => {
    renderAuditorOnTab("history");
    expect(captured.onTabChange).toBeTypeOf("function");
    expect(captured.onViewMerkleProof).toBeTypeOf("function");
    expect(() => captured.onTabChange?.("not-a-tab")).not.toThrow();
    expect(() => captured.onTabChange?.("volume")).not.toThrow();
    expect(() => captured.onViewMerkleProof?.("SALE-1")).not.toThrow();
  });

  it("falls back to the overview for an unknown stored tab", () => {
    const html = renderAuditorOnTab("does-not-exist");
    expect(html).toContain("Organization scope");
    expect(html).not.toContain("Platform Financial Volume");
  });
});
