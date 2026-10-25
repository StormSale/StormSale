// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyContractBytecode } from "../components/auditor/VerifyContractBytecode";

describe("VerifyContractBytecode UI Component (#185)", () => {
  const writeTextMock = vi.fn();
  const createObjectURLMock = vi.fn(() => "blob:http://localhost/mock-blob-url");
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock.mockResolvedValue(undefined),
      },
    });
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders header badges, titles, and default input values", () => {
    render(<VerifyContractBytecode />);

    expect(screen.getByText("Verify Contract Bytecode")).toBeTruthy();
    expect(screen.getByText("Soroban RPC Ledger Verified")).toBeTruthy();
    expect(screen.getByText("WASM / WAT Disassembly")).toBeTruthy();

    const contractInput = screen.getByPlaceholderText(
      "e.g. CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1"
    ) as HTMLInputElement;
    const commitInput = screen.getByPlaceholderText(
      "e.g. f904fa9146e1d06d25acf8cdd0e814ba00839808"
    ) as HTMLInputElement;

    expect(contractInput.value).toBe("CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1");
    expect(commitInput.value).toBe("f904fa9146e1d06d25acf8cdd0e814ba00839808");
  });

  it("updates contract input on typing and clicking preset buttons", () => {
    render(<VerifyContractBytecode />);

    const contractInput = screen.getByPlaceholderText(
      "e.g. CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1"
    ) as HTMLInputElement;

    fireEvent.change(contractInput, { target: { value: "CUSTOM_CONTRACT_123" } });
    expect(contractInput.value).toBe("CUSTOM_CONTRACT_123");

    fireEvent.click(screen.getByRole("button", { name: "Affiliate Registry" }));
    expect(contractInput.value).toBe("CB39F9AA82KLP0192STORMREGISTRYAFFILIATE22TEST");

    fireEvent.click(screen.getByRole("button", { name: "Escrow Protocol" }));
    expect(contractInput.value).toBe("CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1");
  });

  it("updates commit input on typing and clicking test state buttons", () => {
    render(<VerifyContractBytecode />);

    const commitInput = screen.getByPlaceholderText(
      "e.g. f904fa9146e1d06d25acf8cdd0e814ba00839808"
    ) as HTMLInputElement;

    fireEvent.change(commitInput, { target: { value: "my_custom_commit" } });
    expect(commitInput.value).toBe("my_custom_commit");

    fireEvent.click(screen.getByRole("button", { name: "Simulate Mismatch" }));
    expect(commitInput.value).toBe("mismatch_dev_build_unverified");

    fireEvent.click(screen.getByRole("button", { name: "Valid Commit (Matching)" }));
    expect(commitInput.value).toBe("f904fa9146e1d06d25acf8cdd0e814ba00839808");
  });

  it("disables verify button when input is cleared", () => {
    render(<VerifyContractBytecode />);

    const contractInput = screen.getByPlaceholderText(
      "e.g. CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1"
    );
    const verifyButton = screen.getByRole("button", { name: /Verify Bytecode & Disassemble/i });

    expect((verifyButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(contractInput, { target: { value: "" } });
    expect((verifyButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("performs full bytecode verification and renders matching result details", async () => {
    render(<VerifyContractBytecode />);

    const verifyButton = screen.getByRole("button", { name: /Verify Bytecode & Disassemble/i });
    fireEvent.click(verifyButton);

    await waitFor(
      () => {
        expect(screen.getByText("Bytecode Verified: Match Confirmed")).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText("VERIFIED MATCH")).toBeTruthy();
    expect(screen.getByText(/On-Chain WASM SHA-256/i)).toBeTruthy();
    expect(screen.getByText(/Repository Release SHA-256/i)).toBeTruthy();
    expect(screen.getByText(/Bytecode Size:/i)).toBeTruthy();
    expect(screen.getByText(/WebAssembly Text \(WAT\) Disassembly/i)).toBeTruthy();
    expect(screen.getByText(/disassembly\.wat/i)).toBeTruthy();

    // Copy On-Chain hash
    const copyHashButtons = screen.getAllByTitle("Copy Hash");
    expect(copyHashButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(copyHashButtons[0]);
    expect(writeTextMock).toHaveBeenCalled();

    // Copy Repo hash
    fireEvent.click(copyHashButtons[1]);
    expect(writeTextMock).toHaveBeenCalled();

    // Copy WAT
    const copyWatBtn = screen.getByRole("button", { name: /Copy WAT/i });
    fireEvent.click(copyWatBtn);
    expect(writeTextMock).toHaveBeenCalled();

    // Download WAT
    const downloadBtn = screen.getByRole("button", { name: /Export/i });
    fireEvent.click(downloadBtn);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();
  });

  it("filters WAT instructions via the search input and handles no matches", async () => {
    render(<VerifyContractBytecode />);

    fireEvent.click(screen.getByRole("button", { name: /Verify Bytecode & Disassemble/i }));

    await waitFor(
      () => {
        expect(screen.getByText("Bytecode Verified: Match Confirmed")).toBeTruthy();
      },
      { timeout: 3000 }
    );

    const searchInput = screen.getByPlaceholderText("Filter instructions...");
    fireEvent.change(searchInput, { target: { value: "initialize" } });
    expect(screen.getAllByText(/initialize/i).length).toBeGreaterThan(0);

    fireEvent.change(searchInput, { target: { value: "non_existent_instruction_xyz" } });
    expect(screen.getByText(";; No matching instructions found.")).toBeTruthy();
  });

  it("handles mismatch test state verification", async () => {
    render(<VerifyContractBytecode />);

    fireEvent.click(screen.getByRole("button", { name: "Simulate Mismatch" }));
    fireEvent.click(screen.getByRole("button", { name: /Verify Bytecode & Disassemble/i }));

    await waitFor(
      () => {
        expect(screen.getByText("Bytecode Hash Mismatch Detected")).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText("MISMATCH")).toBeTruthy();
    expect(
      screen.getByText(
        "Deployed contract hash does not match the build artifact from the specified commit hash."
      )
    ).toBeTruthy();
  });
});
