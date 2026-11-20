// @vitest-environment happy-dom
/**
 * Cross-browser clipboard permissions and fallback copy tests (#519).
 *
 * Browsers differ in whether `navigator.clipboard.writeText` is available and allowed:
 * - Chromium and Firefox allow it in a secure context after a user gesture.
 * - Safari, iframes without `clipboard-write`, and denied permissions reject it with
 *   `NotAllowedError`.
 * - Plain-HTTP pages and older browsers have no `navigator.clipboard` at all.
 *
 * Each case below drives the real DOM (happy-dom) and the real components, swapping only
 * `navigator.clipboard` and `document.execCommand` to reproduce the browser's behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  COPY_FAILED_TOAST,
  CopyButton,
  CopyableAddress,
  copyToClipboard,
} from "../components/ui/copy-button";
import { NotificationContext, type NotificationContextType } from "../context/NotificationContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5";

/** What the hidden textarea looked like at the moment `execCommand("copy")` ran. */
interface FallbackSnapshot {
  value: string;
  readOnly: boolean;
  ariaHidden: string | null;
  position: string;
  focused: boolean;
}

let container: HTMLDivElement;
let root: Root;
let showNotification: Mock;
let execCommand: Mock;
let snapshots: FallbackSnapshot[];

/** Replaces `navigator.clipboard` for one test; `undefined` simulates an insecure context. */
function setClipboard(clipboard: unknown) {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
}

/** A Clipboard API that resolves, as when the page is allowed to write. */
function permittedClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard({ writeText });
  return writeText;
}

/** A Clipboard API that rejects, as when permission or browser policy blocks it. */
function deniedClipboard() {
  const writeText = vi
    .fn()
    .mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError"));
  setClipboard({ writeText });
  return writeText;
}

/** Makes `execCommand("copy")` succeed or fail, recording the textarea it copied from. */
function mockExecCommand(result: boolean | Error) {
  execCommand = vi.fn().mockImplementation((command: string) => {
    const textarea = document.querySelector("textarea");
    if (command === "copy" && textarea) {
      snapshots.push({
        value: textarea.value,
        readOnly: textarea.hasAttribute("readonly"),
        ariaHidden: textarea.getAttribute("aria-hidden"),
        position: textarea.style.position,
        focused: document.activeElement === textarea,
      });
    }
    if (result instanceof Error) throw result;
    return result;
  });
  Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
}

function render(ui: ReactNode) {
  const value = { showNotification } as unknown as NotificationContextType;
  act(() => {
    root.render(<NotificationContext.Provider value={value}>{ui}</NotificationContext.Provider>);
  });
}

async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

function button(): HTMLButtonElement {
  const found = container.querySelector("button");
  if (!found) throw new Error("CopyButton did not render a button");
  return found;
}

beforeEach(() => {
  snapshots = [];
  showNotification = vi.fn().mockReturnValue("toast-id");
  mockExecCommand(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (document as { execCommand?: unknown }).execCommand;
  vi.restoreAllMocks();
});

describe("copyToClipboard across clipboard permission states (#519)", () => {
  it("writes with navigator.clipboard.writeText when the browser permits it", async () => {
    const writeText = permittedClipboard();

    await expect(copyToClipboard(ADDRESS)).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(execCommand).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to a hidden textarea and execCommand('copy') when permission is denied", async () => {
    const writeText = deniedClipboard();

    await expect(copyToClipboard(ADDRESS)).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(snapshots).toEqual([
      { value: ADDRESS, readOnly: true, ariaHidden: "true", position: "fixed", focused: true },
    ]);
    // The helper textarea is removed once the copy has run.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("uses the fallback when navigator.clipboard is missing (insecure context, older browsers)", async () => {
    setClipboard(undefined);

    await expect(copyToClipboard(ADDRESS)).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(snapshots[0]?.value).toBe(ADDRESS);
  });

  it("uses the fallback when navigator.clipboard has no writeText function", async () => {
    setClipboard({ readText: vi.fn() });

    await expect(copyToClipboard(ADDRESS)).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false and cleans up when both the Clipboard API and execCommand fail", async () => {
    deniedClipboard();
    mockExecCommand(false);

    await expect(copyToClipboard(ADDRESS)).resolves.toBe(false);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false and still removes the textarea when execCommand throws", async () => {
    deniedClipboard();
    mockExecCommand(new Error("execCommand is not supported"));

    await expect(copyToClipboard(ADDRESS)).resolves.toBe(false);

    expect(document.querySelector("textarea")).toBeNull();
  });
});

describe("CopyButton toast feedback (#519)", () => {
  it("shows a success toast and the copied state when writeText is permitted", async () => {
    permittedClipboard();
    const onCopySuccess = vi.fn();
    render(
      <CopyButton text={ADDRESS} label="Copy Address" showToast onCopySuccess={onCopySuccess} />,
    );

    await click(button());

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "Copied to Clipboard" }),
    );
    expect(onCopySuccess).toHaveBeenCalledWith(ADDRESS);
    expect(button().getAttribute("aria-label")).toBe("Copied!");
  });

  it("shows the success toast when the copy only worked through the fallback", async () => {
    deniedClipboard();
    render(<CopyButton text={ADDRESS} label="Copy Address" showToast />);

    await click(button());

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(showNotification).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });

  it("shows an error toast, calls onCopyError and stays uncopied when every method fails", async () => {
    deniedClipboard();
    mockExecCommand(false);
    const onCopyError = vi.fn();
    const onCopySuccess = vi.fn();
    render(
      <CopyButton
        text={ADDRESS}
        label="Copy Address"
        showToast
        onCopyError={onCopyError}
        onCopySuccess={onCopySuccess}
      />,
    );

    await click(button());

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(COPY_FAILED_TOAST);
    expect(onCopyError).toHaveBeenCalledWith(expect.any(Error));
    expect(onCopySuccess).not.toHaveBeenCalled();
    expect(button().getAttribute("aria-label")).toBe("Copy Address");
  });

  it("shows no toast in either case when showToast is off", async () => {
    permittedClipboard();
    render(<CopyButton text={ADDRESS} label="Copy Address" />);
    await click(button());

    deniedClipboard();
    mockExecCommand(false);
    await click(button());

    expect(showNotification).not.toHaveBeenCalled();
  });

  it("does not try to copy or toast when disabled", async () => {
    const writeText = permittedClipboard();
    render(<CopyButton text={ADDRESS} label="Copy Address" showToast disabled />);

    await click(button());

    expect(writeText).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("CopyableAddress toast feedback (#519)", () => {
  function addressBox(): Element {
    const found = container.querySelector('[role="button"]');
    if (!found) throw new Error("CopyableAddress did not render");
    return found;
  }

  it("shows the address-copied toast when the copy succeeds", async () => {
    const writeText = permittedClipboard();
    render(<CopyableAddress address={ADDRESS} />);

    await click(addressBox());

    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Address Copied",
        message: "Stellar address GBBD47...FLA5 copied to clipboard",
      }),
    );
  });

  it("shows the copy-failed toast when clipboard access is blocked everywhere", async () => {
    deniedClipboard();
    mockExecCommand(false);
    render(<CopyableAddress address={ADDRESS} />);

    await click(addressBox());

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(COPY_FAILED_TOAST);
  });
});
