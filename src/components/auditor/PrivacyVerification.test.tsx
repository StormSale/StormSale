import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivacyVerification } from "./PrivacyVerification";
import { PROOF_STEPS } from "../../lib/privacy";

describe("PrivacyVerification (initial render)", () => {
  const html = renderToStaticMarkup(<PrivacyVerification />);

  it("labels the check as a demo, not a production report", () => {
    expect(html).toContain("Demo: this check only inspects the sample records");
    expect(html).toContain("not a production privacy");
  });

  it("shows the proof steps and a sample IP input", () => {
    expect(html).toContain("Proof of zero-PII architecture");
    expect(html).toContain(PROOF_STEPS[0]);
    expect(html).toContain('value="203.0.113.7"');
  });

  it("starts with no records, no error, and the certificate disabled", () => {
    expect(html).toContain("0 record(s) inspected");
    expect(html).not.toContain('role="alert"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?GDPR Certificate/);
  });

  it("enables the Hash action", () => {
    expect(html).toMatch(/<button(?:(?!disabled="")[^>])*>Hash<\/button>/);
  });
});
