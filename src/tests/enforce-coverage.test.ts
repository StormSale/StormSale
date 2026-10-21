import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

// Import CommonJS module functions
// @ts-expect-error CJS module import
import { evaluateCoverage, generateMarkdownReport } from "../../scripts/check-coverage.cjs";

interface FileMetric {
  file: string;
  lines: number;
  statements: number;
  branches: number;
  functions: number;
  meetsThreshold: boolean;
}

describe("Enforced Coverage Thresholds (#95)", () => {
  const mockCoverageSummary = {
    total: {
      lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
      statements: { total: 100, covered: 85, skipped: 0, pct: 85 },
      functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
      branches: { total: 30, covered: 25, skipped: 0, pct: 83.33 },
    },
    [path.resolve(process.cwd(), "src/lib/storage.ts")]: {
      lines: { total: 50, covered: 46, skipped: 0, pct: 92 },
      statements: { total: 50, covered: 46, skipped: 0, pct: 92 },
      functions: { total: 10, covered: 10, skipped: 0, pct: 100 },
      branches: { total: 10, covered: 8, skipped: 0, pct: 80 },
    },
    [path.resolve(process.cwd(), "src/components/ui/button.tsx")]: {
      lines: { total: 20, covered: 20, skipped: 0, pct: 100 },
      statements: { total: 20, covered: 20, skipped: 0, pct: 100 },
      functions: { total: 4, covered: 4, skipped: 0, pct: 100 },
      branches: { total: 4, covered: 4, skipped: 0, pct: 100 },
    },
    [path.resolve(process.cwd(), "src/components/legacy/untested.tsx")]: {
      lines: { total: 40, covered: 10, skipped: 0, pct: 25 },
      statements: { total: 40, covered: 10, skipped: 0, pct: 25 },
      functions: { total: 8, covered: 1, skipped: 0, pct: 12.5 },
      branches: { total: 12, covered: 1, skipped: 0, pct: 8.33 },
    },
  };

  it("evaluates file-by-file coverage metrics accurately against 80% threshold", () => {
    const evaluation = evaluateCoverage(mockCoverageSummary, { threshold: 80 });

    expect(evaluation.threshold).toBe(80);
    expect(evaluation.fileMetrics).toHaveLength(3);

    const storageMetric = evaluation.fileMetrics.find((m: FileMetric) =>
      m.file.includes("src/lib/storage.ts"),
    );
    expect(storageMetric).toBeDefined();
    expect(storageMetric.lines).toBe(92);
    expect(storageMetric.meetsThreshold).toBe(true);

    const untestedMetric = evaluation.fileMetrics.find((m: FileMetric) =>
      m.file.includes("untested.tsx"),
    );
    expect(untestedMetric).toBeDefined();
    expect(untestedMetric.lines).toBe(25);
    expect(untestedMetric.meetsThreshold).toBe(false);
  });

  it("identifies threshold violations when target files drop below 80%", () => {
    const evaluation = evaluateCoverage(mockCoverageSummary, {
      threshold: 80,
      targetFiles: ["src/components/legacy/untested.tsx"],
    });

    expect(evaluation.violations).toHaveLength(1);
    expect(evaluation.violations[0].file).toContain("untested.tsx");
    expect(evaluation.violations[0].lines).toBe(25);
  });

  it("passes when target files meet or exceed the 80% threshold", () => {
    const evaluation = evaluateCoverage(mockCoverageSummary, {
      threshold: 80,
      targetFiles: ["src/lib/storage.ts", "src/components/ui/button.tsx"],
    });

    expect(evaluation.violations).toHaveLength(0);
  });

  it("generates markdown audit report with file-by-file metrics and status indicators", () => {
    const evaluation = evaluateCoverage(mockCoverageSummary, {
      threshold: 80,
      targetFiles: ["src/components/legacy/untested.tsx"],
    });

    const report = generateMarkdownReport(evaluation);

    expect(report).toContain("### 📊 Enforced Test Coverage Audit");
    expect(report).toContain("**Target Threshold:** `80%`");
    expect(report).toContain("#### 📋 File-by-File Coverage Metrics");
    expect(report).toContain("| `src/lib/storage.ts` | 92% | 80% | 100% | **92%** | ✅ |");
    expect(report).toContain("Coverage Threshold Failure");
    expect(report).toContain("dropped below the required 80% threshold");
  });

  it("executes CLI script and returns exit code 0 when target meets threshold", () => {
    const fixturePath = path.resolve(process.cwd(), "node_modules/.tmp-coverage-summary.json");
    fs.writeFileSync(fixturePath, JSON.stringify(mockCoverageSummary));
    const scriptPath = path.resolve(process.cwd(), "scripts/check-coverage.cjs");
    const cmd = `node "${scriptPath}" --threshold=80 --file=node_modules/.tmp-coverage-summary.json --target=src/lib/storage.ts`;
    expect(() => execSync(cmd, { stdio: "pipe" })).not.toThrow();
  });

  it("executes CLI script and exits with code 1 when target drops below threshold", () => {
    const fixturePath = path.resolve(process.cwd(), "node_modules/.tmp-coverage-summary.json");
    fs.writeFileSync(fixturePath, JSON.stringify(mockCoverageSummary));
    const scriptPath = path.resolve(process.cwd(), "scripts/check-coverage.cjs");
    const cmd = `node "${scriptPath}" --threshold=80 --file=node_modules/.tmp-coverage-summary.json --target=src/components/legacy/untested.tsx`;
    expect(() => execSync(cmd, { stdio: "pipe" })).toThrow();
  });
});
