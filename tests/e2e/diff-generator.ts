import * as fs from "fs";
import * as path from "path";

export interface ViewportSnapshotMetrics {
  viewportWidth: number;
  viewportHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  hasHorizontalOverflow: boolean;
  screenshotBase64?: string;
  screenshotFilename?: string;
  elementsChecked?: {
    selector: string;
    description: string;
    visible: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number } | null;
  }[];
}

export interface MultiResolutionComparison {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  mobileMetrics: ViewportSnapshotMetrics;
  desktopMetrics: ViewportSnapshotMetrics;
  responsiveDifferences: {
    property: string;
    mobileValue: string | number;
    desktopValue: string | number;
    notes: string;
  }[];
  timestamp: string;
}

export class VisualDiffReporter {
  private comparisons: MultiResolutionComparison[] = [];
  private outputDirectory: string;

  constructor(outputDirectory: string = "test-results/visual-regression") {
    this.outputDirectory = outputDirectory;
  }

  public addComparison(comparison: MultiResolutionComparison) {
    const existingIndex = this.comparisons.findIndex((c) => c.id === comparison.id);
    if (existingIndex >= 0) {
      this.comparisons[existingIndex] = comparison;
    } else {
      this.comparisons.push(comparison);
    }
  }

  public getComparisons(): MultiResolutionComparison[] {
    return this.comparisons;
  }

  public generateReport(): { jsonPath: string; htmlPath: string } {
    if (!fs.existsSync(this.outputDirectory)) {
      fs.mkdirSync(this.outputDirectory, { recursive: true });
    }

    const jsonPath = path.join(this.outputDirectory, "multi-resolution-diff-summary.json");
    const strippedComparisons = this.comparisons.map((c) => ({
      ...c,
      mobileMetrics: {
        ...c.mobileMetrics,
        screenshotBase64: undefined,
      },
      desktopMetrics: {
        ...c.desktopMetrics,
        screenshotBase64: undefined,
      },
    }));
    fs.writeFileSync(jsonPath, JSON.stringify(strippedComparisons, null, 2), "utf-8");

    const htmlPath = path.join(this.outputDirectory, "visual-regression-report.html");
    const htmlContent = this.renderHtmlReport();
    fs.writeFileSync(htmlPath, htmlContent, "utf-8");

    return { jsonPath, htmlPath };
  }

  private renderHtmlReport(): string {
    const total = this.comparisons.length;
    const passed = this.comparisons.filter((c) => c.passed).length;
    const failed = total - passed;

    const cardsHtml = this.comparisons
      .map((c) => {
        const diffRows = c.responsiveDifferences
          .map(
            (d) => `
          <tr>
            <td class="prop-name">${escapeHtml(d.property)}</td>
            <td class="val-mobile">${escapeHtml(String(d.mobileValue))}</td>
            <td class="val-desktop">${escapeHtml(String(d.desktopValue))}</td>
            <td class="notes">${escapeHtml(d.notes)}</td>
          </tr>`,
          )
          .join("");

        const mobileImg = c.mobileMetrics.screenshotBase64
          ? `<img src="data:image/png;base64,${c.mobileMetrics.screenshotBase64}" alt="${escapeHtml(c.title)} 375px" class="preview-img" />`
          : `<div class="no-img">Snapshot saved to test-results</div>`;

        const desktopImg = c.desktopMetrics.screenshotBase64
          ? `<img src="data:image/png;base64,${c.desktopMetrics.screenshotBase64}" alt="${escapeHtml(c.title)} 1440px" class="preview-img" />`
          : `<div class="no-img">Snapshot saved to test-results</div>`;

        return `
        <div class="comparison-card ${c.passed ? "pass" : "fail"}">
          <div class="card-header">
            <div>
              <span class="badge ${c.passed ? "badge-pass" : "badge-fail"}">${c.passed ? "PASS" : "FAIL"}</span>
              <h3 class="card-title">${escapeHtml(c.title)}</h3>
              <p class="card-desc">${escapeHtml(c.description)}</p>
            </div>
            <div class="timestamp">${new Date(c.timestamp).toLocaleString()}</div>
          </div>

          <div class="visual-previews">
            <div class="preview-column mobile-col">
              <div class="preview-header">
                <strong>Mobile Viewport (375px)</strong>
                <span class="overflow-tag ${c.mobileMetrics.hasHorizontalOverflow ? "tag-warn" : "tag-ok"}">
                  ${c.mobileMetrics.hasHorizontalOverflow ? "Overflow Detected!" : "No Horizontal Overflow (Safe)"}
                </span>
              </div>
              <div class="metrics-row">
                <span>Scroll: ${c.mobileMetrics.scrollWidth}px / ${c.mobileMetrics.scrollHeight}px</span>
                <span>Client: ${c.mobileMetrics.clientWidth}px / ${c.mobileMetrics.clientHeight}px</span>
              </div>
              <div class="img-frame">${mobileImg}</div>
            </div>

            <div class="preview-column desktop-col">
              <div class="preview-header">
                <strong>Desktop Viewport (1440px)</strong>
                <span class="overflow-tag ${c.desktopMetrics.hasHorizontalOverflow ? "tag-warn" : "tag-ok"}">
                  ${c.desktopMetrics.hasHorizontalOverflow ? "Overflow Detected!" : "No Horizontal Overflow (Safe)"}
                </span>
              </div>
              <div class="metrics-row">
                <span>Scroll: ${c.desktopMetrics.scrollWidth}px / ${c.desktopMetrics.scrollHeight}px</span>
                <span>Client: ${c.desktopMetrics.clientWidth}px / ${c.desktopMetrics.clientHeight}px</span>
              </div>
              <div class="img-frame">${desktopImg}</div>
            </div>
          </div>

          <div class="diff-table-container">
            <h4>Multi-Resolution Responsive Break & Layout Comparison</h4>
            <table class="diff-table">
              <thead>
                <tr>
                  <th>Component / Layout Feature</th>
                  <th>Mobile (375px)</th>
                  <th>Desktop (1440px)</th>
                  <th>Verification Notes</th>
                </tr>
              </thead>
              <tbody>
                ${diffRows}
              </tbody>
            </table>
          </div>
        </div>`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>StormSale Multi-Resolution Visual Regression Report (375px vs 1440px)</title>
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #18181b;
      --border: #27272a;
      --text: #fafafa;
      --text-muted: #a1a1aa;
      --primary: #6366f1;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 1300px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 26px;
      font-weight: 800;
      background: linear-gradient(135deg, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .summary-stats {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }
    .stat-pill {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 8px 16px;
      border-radius: 9999px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .comparison-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .card-title {
      margin: 8px 0 4px 0;
      font-size: 20px;
      font-weight: 700;
    }
    .card-desc {
      margin: 0;
      font-size: 14px;
      color: var(--text-muted);
    }
    .badge {
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-pass { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    .badge-fail { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .visual-previews {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    @media (max-width: 900px) {
      .visual-previews { grid-template-columns: 1fr; }
    }
    .preview-column {
      background: #121215;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
    }
    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .overflow-tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .tag-ok { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .tag-warn { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .metrics-row {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      gap: 16px;
      margin-bottom: 12px;
    }
    .img-frame {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      min-height: 240px;
    }
    .preview-img {
      max-width: 100%;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .diff-table-container {
      margin-top: 16px;
    }
    .diff-table-container h4 {
      margin: 0 0 10px 0;
      font-size: 15px;
      color: var(--text);
    }
    .diff-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .diff-table th, .diff-table td {
      border: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
    }
    .diff-table th {
      background: #202024;
      color: var(--text-muted);
      font-weight: 600;
    }
    .prop-name { font-weight: 600; color: #93c5fd; }
    .val-mobile { color: #f472b6; }
    .val-desktop { color: #34d399; }
    .notes { color: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>StormSale Multi-Resolution Visual Regression & Diff Report</h1>
      <p style="color: var(--text-muted); margin: 0;">Automated pixel-level and layout break comparison across Mobile (375px) vs Desktop (1440px) breakpoints.</p>
      <div class="summary-stats">
        <div class="stat-pill"><strong>Total Comparisons:</strong> ${total}</div>
        <div class="stat-pill" style="color: var(--success);"><strong>Passed:</strong> ${passed}</div>
        <div class="stat-pill" style="color: ${failed > 0 ? "var(--danger)" : "var(--text-muted)"};"><strong>Failed:</strong> ${failed}</div>
      </div>
    </header>
    ${cardsHtml}
  </div>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
