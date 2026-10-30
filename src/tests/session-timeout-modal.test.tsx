// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionTimeoutModal } from "../components/shared/SessionTimeoutModal";

function setup(props: Partial<React.ComponentProps<typeof SessionTimeoutModal>> = {}) {
  const onExtend = vi.fn();
  const onDisconnect = vi.fn();
  render(
    <SessionTimeoutModal
      isOpen
      remainingSeconds={75}
      onExtend={onExtend}
      onDisconnect={onDisconnect}
      {...props}
    />,
  );
  return { onExtend, onDisconnect };
}

describe("SessionTimeoutModal (#83)", () => {
  it("renders nothing when closed", () => {
    setup({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the countdown as MM:SS", () => {
    setup({ remainingSeconds: 75 });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("01:15")).toBeTruthy();
  });

  it("pads single-digit seconds", () => {
    setup({ remainingSeconds: 9 });
    expect(screen.getByText("00:09")).toBeTruthy();
  });

  it("calls onExtend when Stay Connected is activated", () => {
    const { onExtend, onDisconnect } = setup();
    fireEvent.click(screen.getByRole("button", { name: /stay connected/i }));
    expect(onExtend).toHaveBeenCalledTimes(1);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("calls onDisconnect when Disconnect Now is activated", () => {
    const { onExtend, onDisconnect } = setup();
    fireEvent.click(screen.getByRole("button", { name: /disconnect now/i }));
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onExtend).not.toHaveBeenCalled();
  });

  it("ignores Escape so the user must choose an explicit action", () => {
    const { onExtend, onDisconnect } = setup();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onExtend).not.toHaveBeenCalled();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
