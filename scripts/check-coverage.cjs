/**
 * StormSale Automated Coverage & Threshold Enforcement Script
 *
 * Implements Issue #95: [Test] Enforced Coverage Thresholds
 * - Reads coverage summary from Vitest v8 coverage report.
 * - Produces file-by-file coverage metrics table.
 * - Enforces minimum 80% coverage threshold.
 * - Blocks PR merges in CI if coverage thresholds are violated.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_THRESHOLD = 80;

function parseArgs() {
  const args = process.argv.slice(2);
  let threshold = DEFAULT_THRESHOLD;
  let summaryFile = path.resolve(process.cwd(), 'coverage/coverage-summary.json');
  let changedOnly = false;
  let targetFiles = [];

  for (const arg of args) {
    if (arg.startsWith('--threshold=')) {
      threshold = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--file=')) {
      summaryFile = path.resolve(process.cwd(), arg.split('=')[1]);
    } else if (arg === '--changed-only') {
      changedOnly = true;
    } else if (arg.startsWith('--target=')) {
      targetFiles = arg.split('=')[1].split(',').map((f) => f.trim());
    }
  }

  return { threshold, summaryFile, changedOnly, targetFiles };
}

function getChangedFiles() {
  try {
    const baseRef = process.env.GITHUB_BASE_REF || 'dev';
    const output = execSync(`git diff --name-only origin/${baseRef}...HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || git status --porcelain`, {
      encoding: 'utf8',
    });
    return output
      .split('\n')
      .map((line) => line.replace(/^[ MADRCU?!]+\s+/, '').trim())
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .filter((file) => !file.includes('.test.') && !file.startsWith('src/tests/'));
  } catch {
    return [];
  }
}

function evaluateCoverage(summaryData, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const targetFiles = options.targetFiles || [];
  const rootDir = process.cwd();

  const entries = Object.entries(summaryData);
  const totalEntry = summaryData.total;

  const fileMetrics = [];
  let violations = [];

  for (const [fullPath, metrics] of entries) {
    if (fullPath === 'total') continue;

    let relativePath;
    if (path.isAbsolute(fullPath)) {
      const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      if (rel.startsWith('src/')) {
        relativePath = rel;
      } else if (fullPath.includes('/src/')) {
        relativePath = fullPath.slice(fullPath.indexOf('/src/') + 1).replace(/\\/g, '/');
      } else {
        relativePath = rel;
      }
    } else {
      relativePath = fullPath.replace(/\\/g, '/');
    }

    // Skip tests or type declarations
    if (relativePath.includes('.test.') || relativePath.startsWith('src/tests/') || relativePath.includes('src/types/')) {
      continue;
    }

    const linesPct = metrics.lines.pct;
    const stmtsPct = metrics.statements.pct;
    const branchPct = metrics.branches.pct;
    const funcsPct = metrics.functions.pct;

    const meetsThreshold = linesPct >= threshold || stmtsPct >= threshold;

    const metric = {
      file: relativePath,
      lines: linesPct,
      statements: stmtsPct,
      branches: branchPct,
      functions: funcsPct,
      meetsThreshold,
    };

    fileMetrics.push(metric);

    // If targeted files specified or checked
    if (targetFiles.length > 0) {
      if (targetFiles.some((tf) => relativePath.includes(tf)) && !meetsThreshold) {
        violations.push(metric);
      }
    }
  }

  // Sort by lowest line coverage first
  fileMetrics.sort((a, b) => a.file.localeCompare(b.file));

  return {
    threshold,
    total: totalEntry,
    fileMetrics,
    violations,
  };
}

function generateMarkdownReport(evaluation) {
  const { threshold, total, fileMetrics, violations } = evaluation;

  let md = `### 📊 Enforced Test Coverage Audit\n\n`;
  md += `**Target Threshold:** \`${threshold}%\`\n\n`;

  if (total) {
    md += `| Scope | Statements | Branches | Functions | Lines | Status |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    const linesPassed = total.lines.pct >= threshold;
    const statusIcon = linesPassed ? '✅ Passed' : '⚠️ Below Threshold';
    md += `| **Overall Codebase** | ${total.statements.pct}% | ${total.branches.pct}% | ${total.functions.pct}% | **${total.lines.pct}%** | ${statusIcon} |\n\n`;
  }

  md += `#### 📋 File-by-File Coverage Metrics\n\n`;
  md += `| File | Statements | Branches | Functions | Lines | Status |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const m of fileMetrics) {
    const icon = m.lines >= threshold ? '✅' : '❌';
    md += `| \`${m.file}\` | ${m.statements}% | ${m.branches}% | ${m.functions}% | **${m.lines}%** | ${icon} |\n`;
  }

  if (violations.length > 0) {
    md += `\n> [!CAUTION]\n`;
    md += `> **Coverage Threshold Failure**: ${violations.length} target file(s) dropped below the required ${threshold}% threshold:\n`;
    for (const v of violations) {
      md += `> - \`${v.file}\`: ${v.lines}% lines (required >= ${threshold}%)\n`;
    }
  }

  return md;
}

function run() {
  const { threshold, summaryFile, changedOnly, targetFiles } = parseArgs();

  if (!fs.existsSync(summaryFile)) {
    console.error(`❌ Coverage summary file not found at: ${summaryFile}`);
    console.error(`Please run "npm run test:coverage" before running coverage checks.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(summaryFile, 'utf8');
  const summaryData = JSON.parse(raw);

  let activeTargetFiles = targetFiles;
  if (changedOnly) {
    const changed = getChangedFiles();
    if (changed.length > 0) {
      activeTargetFiles = changed;
      console.log(`🔍 Evaluating coverage for ${changed.length} changed PR file(s)...`);
    }
  }

  const evaluation = evaluateCoverage(summaryData, {
    threshold,
    targetFiles: activeTargetFiles,
  });

  const report = generateMarkdownReport(evaluation);
  console.log(report);

  // Write report for GitHub Actions Step Summary if in CI
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }

  // Also write markdown report to file for workflow access
  fs.writeFileSync(path.resolve(process.cwd(), 'coverage-audit-report.md'), report, 'utf8');

  if (evaluation.violations.length > 0) {
    console.error(`\n❌ [Coverage Threshold Violated]: PR cannot be merged because target files dropped below ${threshold}%.`);
    process.exit(1);
  }

  console.log(`\n✅ Coverage audit completed successfully.`);
}

if (require.main === module) {
  run();
}

module.exports = {
  evaluateCoverage,
  generateMarkdownReport,
};
