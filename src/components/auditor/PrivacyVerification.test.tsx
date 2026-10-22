// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PrivacyVerification } from "./PrivacyVerification";
import { PROOF_STEPS } from "../../lib/privacy";

const hashButton = () => screen.getByRole("button", { name: /^(Hash|Hashing\.\.\.)$/ });
const certButton = () => screen.getByRole("button", { name: /GDPR Certificate/ });
const ipInput = () => screen.getByLabelText("Sample IP");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PrivacyVerification", () => {
  it("renders the demo notice, proof steps and an empty verifier", () => {
    render(<PrivacyVerification />);
    expect(screen.getByRole("note").textContent).toContain("not a production privacy");
    expect(screen.getByText(PROOF_STEPS[0])).toBeTruthy();
    expect(screen.getByText(/0 record\(s\) inspected/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((certButton() as HTMLButtonElement).disabled).toBe(true);
    expect((hashButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows Hashing... while pending, then appends a hashed record without the raw IP", async () => {
    const { container } = render(<PrivacyVerification />);
    fireEvent.click(hashButton());
    expect(hashButton().textContent).toBe("Hashing...");
    expect((hashButton() as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(screen.getByText(/1 record\(s\) inspected/)).toBeTruthy());
    expect(hashButton().textContent).toBe("Hash");
    expect((hashButton() as HTMLButtonElement).disabled).toBe(false);
    const pre = container.querySelector("pre")!.textContent!;
    expect(pre).toMatch(/"ipHash": "[0-9a-f]{64}"/);
    expect(pre).not.toContain("203.0.113.7");
    expect(screen.getByText(/no raw IPs found in samples/)).toBeTruthy();
  });

  it("rejects invalid input with an alert and adds no record", async () => {
    render(<PrivacyVerification />);
    fireEvent.change(ipInput(), { target: { value: "not-an-ip" } });
    fireEvent.click(hashButton());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter a valid IPv4 or IPv6 address.");
    expect(screen.getByText(/0 record\(s\) inspected/)).toBeTruthy();
    expect((certButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears the error after a subsequent valid hash", async () => {
    render(<PrivacyVerification />);
    fireEvent.change(ipInput(), { target: { value: "bad" } });
    fireEvent.click(hashButton());
    await screen.findByRole("alert");
    fireEvent.change(ipInput(), { target: { value: "2001:db8::1" } });
    fireEvent.click(hashButton());
    await waitFor(() => expect(screen.getByText(/1 record\(s\) inspected/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("enables the certificate after a hash and downloads a text report", async () => {
    const createObjectURL = vi.fn(() => "blob:cert");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<PrivacyVerification />);
    fireEvent.click(hashButton());
    await waitFor(() => expect((certButton() as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(certButton());

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown[])[0] as Blob;
    expect(await blob.text()).toContain("Status:      NO RAW IPS DETECTED");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cert");
  });
});
