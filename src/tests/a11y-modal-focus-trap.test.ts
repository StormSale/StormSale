// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { ConnectWalletModal } from "../components/shared/ConnectWalletModal";
import { ConfirmationModal } from "../components/shared/ConfirmationModal";
import { CampaignCreationModal } from "../components/advertiser/CampaignCreationModal";
import { MultiSigApprovalModal } from "../components/shared/MultiSigApprovalModal";

// Mocks for Web3 context & external dependencies used by ConnectWalletModal
const web3Mock = vi.hoisted(() => ({ current: {} as any }));
const walletConnectMock = vi.hoisted(() => ({ connect: vi.fn() }));
const qrMock = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3Mock.current }));
vi.mock("../context/WalletConnectContext", () => ({
  useWalletConnect: () => walletConnectMock,
}));
vi.mock("qrcode", () => ({ default: qrMock }));
vi.mock("framer-motion", () => {
  const MotionComponent = (props: any) => {
    const { initial, animate, exit, transition, ...rest } = props;
    return React.createElement("div", rest);
  };
  return {
    motion: new Proxy({}, { get: () => MotionComponent }),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("a11y-modal-focus-trap test suite (Issue #511)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    qrMock.toDataURL.mockResolvedValue("data:image/png;base64,mockqr");
    web3Mock.current = {
      isWalletModalOpen: true,
      closeWalletModal: vi.fn(),
      connectWallet: vi.fn().mockResolvedValue(undefined),
      isMultiSigModalOpen: false,
      closeMultiSigModal: vi.fn(),
      userAddress: null,
      connectorType: null,
      multiSigInfo: null,
      activeMultiSigXdr: null,
      activeMultiSigDescription: null,
      refreshMultiSigInfo: vi.fn(),
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    document.body.innerHTML = "";
  });

  describe("1. Verify opening a modal moves focus to first focusable element inside the modal", () => {
    it("moves focus to first focusable element upon opening wallet selection modal", async () => {
      const triggerBtn = document.createElement("button");
      triggerBtn.textContent = "Open Wallet";
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      await act(async () => {
        root.render(React.createElement(ConnectWalletModal));
      });

      // Flush requestAnimationFrame
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      const modal = container.querySelector('[role="dialog"]');
      expect(modal).not.toBeNull();

      const focusable = modal!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      expect(focusable.length).toBeGreaterThan(0);
      expect(document.activeElement).toBe(focusable[0]);
    });

    it("moves focus to first focusable element upon opening confirmation modal", async () => {
      await act(async () => {
        root.render(
          React.createElement(ConfirmationModal, {
            isOpen: true,
            title: "Confirm Action",
            description: "Are you sure you want to proceed?",
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
          }),
        );
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      const modal = container.querySelector('[role="dialog"]');
      expect(modal).not.toBeNull();

      const focusable = modal!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      expect(document.activeElement).toBe(focusable[0]);
    });

    it("moves focus to first focusable element upon opening campaign creation modal", async () => {
      await act(async () => {
        root.render(
          React.createElement(CampaignCreationModal, {
            isOpen: true,
            onClose: vi.fn(),
          }),
        );
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      const modal = container.querySelector('[role="dialog"]');
      expect(modal).not.toBeNull();

      const focusable = modal!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      expect(document.activeElement).toBe(focusable[0]);
    });
  });

  describe("2. Test pressing Tab and Shift+Tab cycles focus strictly inside the modal (focus trap)", () => {
    it("cycles from last focusable element to first focusable element on Tab", async () => {
      await act(async () => {
        root.render(
          React.createElement(ConfirmationModal, {
            isOpen: true,
            title: "Focus Trap Test",
            description: "Testing Tab loop",
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
          }),
        );
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      const modal = container.querySelector('[role="dialog"]');
      const focusable = modal!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      // Focus last element
      lastElement.focus();
      expect(document.activeElement).toBe(lastElement);

      // Press Tab on last element -> wraps to first
      const tabEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(tabEvent);

      expect(document.activeElement).toBe(firstElement);
    });

    it("cycles from first focusable element to last focusable element on Shift+Tab", async () => {
      await act(async () => {
        root.render(
          React.createElement(ConfirmationModal, {
            isOpen: true,
            title: "Focus Trap Test",
            description: "Testing Shift+Tab loop",
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
          }),
        );
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      const modal = container.querySelector('[role="dialog"]');
      const focusable = modal!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      // Focus first element
      firstElement.focus();
      expect(document.activeElement).toBe(firstElement);

      // Press Shift+Tab on first element -> wraps to last
      const shiftTabEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(shiftTabEvent);

      expect(document.activeElement).toBe(lastElement);
    });
  });

  describe("3. Verify pressing Escape closes modal and restores focus to triggering button", () => {
    it("dismisses modal on Escape key and restores focus to triggering button", async () => {
      const triggerBtn = document.createElement("button");
      triggerBtn.id = "trigger-test-btn";
      triggerBtn.textContent = "Open Confirm";
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();
      expect(document.activeElement).toBe(triggerBtn);

      const onCloseMock = vi.fn();

      const TestHarness: React.FC = () => {
        const [open, setOpen] = useState(true);
        return React.createElement(ConfirmationModal, {
          isOpen: open,
          title: "Esc Dismiss Test",
          description: "Testing Esc key and focus restoration",
          onConfirm: vi.fn(),
          onCancel: () => {
            onCloseMock();
            setOpen(false);
          },
        });
      };

      await act(async () => {
        root.render(React.createElement(TestHarness));
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      // Assert modal is open and focus has moved inside modal
      expect(document.activeElement).not.toBe(triggerBtn);

      // Press Escape
      await act(async () => {
        const escEvent = new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(escEvent);
      });

      expect(onCloseMock).toHaveBeenCalledTimes(1);

      // Assert focus is restored to the triggering button
      expect(document.activeElement).toBe(triggerBtn);
    });

    it("restores focus when modal is closed programmatically", async () => {
      const triggerBtn = document.createElement("button");
      document.body.appendChild(triggerBtn);
      triggerBtn.focus();

      const TestToggle: React.FC<{ isOpen: boolean }> = ({ isOpen }) =>
        React.createElement(CampaignCreationModal, { isOpen, onClose: vi.fn() });

      await act(async () => {
        root.render(React.createElement(TestToggle, { isOpen: true }));
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      expect(document.activeElement).not.toBe(triggerBtn);

      // Close modal
      await act(async () => {
        root.render(React.createElement(TestToggle, { isOpen: false }));
      });

      expect(document.activeElement).toBe(triggerBtn);
    });
  });

  describe("4. Run axe-core accessibility scanner asserting 0 WCAG 2.1 AA violations", () => {
    it("passes axe-core accessibility scan on ConnectWalletModal", async () => {
      await act(async () => {
        root.render(React.createElement(ConnectWalletModal));
      });

      const modal = container.querySelector('[role="dialog"]') as HTMLElement;
      expect(modal).not.toBeNull();

      const results = await axe.run(modal, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa"],
        },
      });

      expect(results.violations).toEqual([]);
    });

    it("passes axe-core accessibility scan on ConfirmationModal", async () => {
      await act(async () => {
        root.render(
          React.createElement(ConfirmationModal, {
            isOpen: true,
            title: "Accessibility Verified Confirmation",
            description: "WCAG 2.1 AA certified modal dialog.",
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
          }),
        );
      });

      const modal = container.querySelector('[role="dialog"]') as HTMLElement;
      expect(modal).not.toBeNull();

      const results = await axe.run(modal, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa"],
        },
      });

      expect(results.violations).toEqual([]);
    });

    it("passes axe-core accessibility scan on CampaignCreationModal", async () => {
      await act(async () => {
        root.render(
          React.createElement(CampaignCreationModal, {
            isOpen: true,
            onClose: vi.fn(),
          }),
        );
      });

      const modal = container.querySelector('[role="dialog"]') as HTMLElement;
      expect(modal).not.toBeNull();

      const results = await axe.run(modal, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa"],
        },
      });

      expect(results.violations).toEqual([]);
    });
  });

  describe("5. Component specific workflows & edge cases", () => {
    it("renders CampaignCreationModal form and submits with input values", async () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      await act(async () => {
        root.render(
          React.createElement(CampaignCreationModal, {
            isOpen: true,
            onClose,
            onSubmit,
          }),
        );
      });

      const titleInput = container.querySelector("#campaign-title") as HTMLInputElement;
      const budgetInput = container.querySelector("#campaign-budget") as HTMLInputElement;
      const rateInput = container.querySelector("#campaign-rate") as HTMLInputElement;
      const form = container.querySelector("form") as HTMLFormElement;

      expect(titleInput).not.toBeNull();
      expect(budgetInput).not.toBeNull();
      expect(rateInput).not.toBeNull();

      const setInputValue = (input: HTMLInputElement, val: string) => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, val);
        } else {
          input.value = val;
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };

      // Trigger change events with native value setter
      await act(async () => {
        setInputValue(titleInput, "Test Campaign");
        setInputValue(budgetInput, "500");
        setInputValue(rateInput, "15");
      });

      // Submit form
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(onSubmit).toHaveBeenCalledWith({
        title: "Test Campaign",
        budget: "500",
        rate: "15",
      });
      expect(onClose).toHaveBeenCalled();
    });

    it("renders CampaignCreationModal null when isOpen is false", async () => {
      await act(async () => {
        root.render(
          React.createElement(CampaignCreationModal, {
            isOpen: false,
            onClose: vi.fn(),
          }),
        );
      });
      expect(container.innerHTML).toBe("");
    });

    it("renders MultiSigApprovalModal with focus trap when open", async () => {
      web3Mock.current.isMultiSigModalOpen = true;

      await act(async () => {
        root.render(React.createElement(MultiSigApprovalModal));
      });

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      });

      const modal = container.querySelector('[role="dialog"]');
      expect(modal).not.toBeNull();
    });
  });
});
