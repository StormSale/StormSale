import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  evaluateTransactionVolume,
  TransactionVolumeGuard,
  ABSOLUTE_VOLUME_THRESHOLD_XLM,
  RELATIVE_VOLUME_MULTIPLIER_THRESHOLD,
} from "../lib/transactionVolumeThreshold";
import { HighVolumeWarningModal } from "../components/shared/HighVolumeWarningModal";

describe("Issue #480: Anomalous transaction volume threshold warning tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Transaction Volume Threshold Evaluation Logic", () => {
    it("flags transactions exceeding 50,000 XLM absolute threshold as anomalous", () => {
      const evaluation = evaluateTransactionVolume(55000);
      expect(evaluation.isAnomalous).toBe(true);
      expect(evaluation.reason).toBe("ABSOLUTE_THRESHOLD_EXCEEDED");
      expect(evaluation.thresholdXlm).toBe(ABSOLUTE_VOLUME_THRESHOLD_XLM);
      expect(evaluation.warningMessage).toContain("55,000 XLM exceeds the high-value safety threshold of 50,000 XLM");
    });

    it("flags transactions exceeding 10x normal volume baseline as anomalous", () => {
      expect(RELATIVE_VOLUME_MULTIPLIER_THRESHOLD).toBe(10);
      const baseline = 500; // e.g. normal user volume 500 XLM
      const highAmount = 6000; // 12x normal volume (> 10x)

      const evaluation = evaluateTransactionVolume(highAmount, baseline);
      expect(evaluation.isAnomalous).toBe(true);
      expect(evaluation.reason).toBe("RELATIVE_THRESHOLD_EXCEEDED");
      expect(evaluation.multiplier).toBe(12);
      expect(evaluation.warningMessage).toContain("12x higher than your normal transaction volume");
    });

    it("flags transactions exceeding both absolute (50,000) and relative (10x) thresholds as BOTH", () => {
      const baseline = 2000;
      const amount = 60000; // 30x baseline and > 50,000

      const evaluation = evaluateTransactionVolume(amount, baseline);
      expect(evaluation.isAnomalous).toBe(true);
      expect(evaluation.reason).toBe("BOTH");
      expect(evaluation.warningMessage).toContain("exceeds both the 50,000 XLM safety threshold and 10x your average volume");
    });

    it("does not flag normal transactions below 50,000 XLM and within 10x normal volume", () => {
      const evaluation1 = evaluateTransactionVolume(1000);
      expect(evaluation1.isAnomalous).toBe(false);

      const evaluation2 = evaluateTransactionVolume(3500, 500); // 7x baseline (< 10x) and < 50,000 XLM
      expect(evaluation2.isAnomalous).toBe(false);
      expect(evaluation2.reason).toBeUndefined();
    });
  });

  describe("TransactionVolumeGuard State & Lifecycle", () => {
    it("requires warning and confirmation for high volume, allows immediate confirmation for normal volume", () => {
      const guard = new TransactionVolumeGuard();

      // Normal volume does not require warning
      const normalResult = guard.initiate(1000);
      expect(normalResult.requiresWarning).toBe(false);
      expect(guard.getStatus()).toBe("confirmed");

      // High volume requires warning
      const highResult = guard.initiate(60000);
      expect(highResult.requiresWarning).toBe(true);
      expect(guard.getStatus()).toBe("warning_required");

      // Cannot confirm until checkbox is checked
      expect(guard.confirm()).toBe(false);

      guard.setCheckboxConfirmed(true);
      expect(guard.confirm()).toBe(true);
      expect(guard.getStatus()).toBe("confirmed");
    });

    it("cleanly resets state on cancellation", () => {
      const guard = new TransactionVolumeGuard();
      guard.initiate(75000);
      guard.setCheckboxConfirmed(true);
      expect(guard.isConfirmed()).toBe(true);

      guard.cancel();
      expect(guard.getStatus()).toBe("cancelled");
      expect(guard.getPendingAmount()).toBe(0);
      expect(guard.isConfirmed()).toBe(false);
    });
  });

  describe("HighVolumeWarningModal Component & Required Checkbox Confirmation", () => {
    it("renders warning dialog with transaction amount and details", () => {
      render(
        React.createElement(HighVolumeWarningModal, {
          isOpen: true,
          amount: 60000,
          asset: "XLM",
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        })
      );

      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(screen.getByText("High-Value Transaction Warning")).toBeTruthy();
      expect(screen.getAllByText(/60,000 XLM/i).length).toBeGreaterThan(0);
      expect(screen.getByText("I understand this is a high-value transaction")).toBeTruthy();
    });

    it("keeps Confirm button disabled until 'I understand this is a high-value transaction' checkbox is checked", () => {
      const handleConfirm = vi.fn();
      const handleCancel = vi.fn();

      render(
        React.createElement(HighVolumeWarningModal, {
          isOpen: true,
          amount: 52000,
          onConfirm: handleConfirm,
          onCancel: handleCancel,
        })
      );

      const confirmButton = screen.getByRole("button", { name: /Confirm & Proceed/i }) as HTMLButtonElement;
      const checkbox = screen.getByLabelText("I understand this is a high-value transaction") as HTMLInputElement;

      // Initially disabled
      expect(confirmButton.disabled).toBe(true);

      // Clicking disabled button does not trigger confirm
      fireEvent.click(confirmButton);
      expect(handleConfirm).not.toHaveBeenCalled();

      // Check the checkbox
      fireEvent.click(checkbox);
      expect(confirmButton.disabled).toBe(false);

      // Clicking now triggers confirmation
      fireEvent.click(confirmButton);
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });

    it("cleanly resets transaction state and triggers onCancel when Cancel is clicked", () => {
      const handleConfirm = vi.fn();
      const handleCancel = vi.fn();

      const Wrapper = () => {
        const [isOpen, setIsOpen] = useState(true);
        const [amount, setAmount] = useState(70000);

        return React.createElement(
          "div",
          null,
          React.createElement("span", { "data-testid": "tx-amount" }, amount),
          React.createElement(HighVolumeWarningModal, {
            isOpen,
            amount,
            onConfirm: handleConfirm,
            onCancel: () => {
              setIsOpen(false);
              setAmount(0); // Clean transaction reset
              handleCancel();
            },
          })
        );
      };

      render(React.createElement(Wrapper));

      const cancelButton = screen.getByRole("button", { name: /Cancel Transaction/i });
      fireEvent.click(cancelButton);

      expect(handleCancel).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("tx-amount").textContent).toBe("0");
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
