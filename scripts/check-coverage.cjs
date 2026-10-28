/**
 * StormSale Automated Coverage & Threshold Enforcement Script
 *
 * Implements Issue #95: [Test] Enforced Coverage Thresholds
 * - Reads per-line coverage from the Vitest v8 LCOV report (coverage/lcov.info).
 * - Enforces the threshold against the lines a PR actually ADDS/CHANGES
 *   (diff/patch coverage) instead of whole legacy files, so a feature PR is not
 *   penalised for touching pre-existing, unrelated, low-coverage code.
 * - Produces a file-by-file report and blocks the PR when added lines fall short.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_THRESHOLD = 80;

/** Normalize an lcov/absolute source path to a repo-relative `src/...` POSIX path. */
function normalizeToRelative(fullPath, rootDir) {
  const unified = fullPath.replace(/\\/g, '/');
  if (path.isAbsolute(fullPath)) {
    const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    if (rel.startsWith('src/')) return rel;
    const idx = unified.indexOf('/src/');
    if (idx !== -1) return unified.slice(idx + 1);
    return rel;
  }
  return unified;
}

/** Parse an lcov.info file into a map of `src/...` POSIX path -> { line -> hitCount }. */
function loadLcov(lcovPath, rootDir = process.cwd()) {
  const raw = fs.readFileSync(lcovPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const result = {};
  let currentFile = null;
  let currentHits = null;
  for (const line of lines) {
    if (line.startsWith('SF:')) {
      currentFile = normalizeToRelative(line.slice(3).trim(), rootDir);
      currentHits = {};
    } else if (line.startsWith('DA:')) {
      const [lineNo, hits] = line.slice(3).split(',');
      const ln = parseInt(lineNo, 10);
      const hit = parseInt(hits, 10);
      if (!Number.isNaN(ln)) {
        // A line can appear once in lcov; keep the max hit count defensively.
        currentHits[ln] = Math.max(currentHits[ln] || 0, Number.isNaN(hit) ? 0 : hit);
      }
    } else if (line.trim() === 'end_of_record') {
      if (currentFile) result[currentFile] = currentHits;
      currentFile = null;
      currentHits = null;
    }
  }
  return result;
}

/**
 * Given a unified-diff patch body for a single file, return the new-file line
 * numbers that were added. Handles `@@ -a,b +c,d @@` hunk headers.
 */
function parseAddedLinesFromPatch(patch) {
  const added = [];
  if (!patch) return added;
  const lines = patch.split(/\r?\n/);
  let newLine = 0;
  for (const line of lines) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = parseInt(hunk[1], 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push(newLine);
      newLine += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line: does not advance the new-file counter.
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" marker.
    } else {
      // Context line advances the new-file counter.
      newLine += 1;
    }
  }
  return added;
}

/** Whether a changed source file should be evaluated for coverage. */
function isCoverageRelevant(file) {
  return (
    (file.endsWith('.ts') || file.endsWith('.tsx')) &&
    !file.includes('.test.') &&
    !file.startsWith('src/tests/') &&
    !file.startsWith('src/types/')
  );
}

/**
 * Compute changed-file targets directly from git for local runs.
 * Uses `git diff -U0 <base>...HEAD` so only added lines are counted.
 */
function computeChangedTargetsFromGit(baseRef) {
  const base = baseRef || process.env.GITHUB_BASE_REF || 'origin/dev';
  let diff = '';
  try {
    diff = execSync(`git diff -U0 ${base}...HEAD`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    try {
      diff = execSync('git diff -U0 HEAD~1', { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    } catch {
      return [];
    }
  }
  const targets = [];
  let current = null;
  let newLine = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ b/')) {
      if (current && current.addedLines.length) targets.push(current);
      current = { file: line.slice(6).replace(/\\/g, '/'), addedLines: [] };
      newLine = 0;
    } else if (current) {
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunk) {
        newLine = parseInt(hunk[1], 10);
      } else if (line.startsWith('+')) {
        current.addedLines.push(newLine);
        newLine += 1;
      } else if (!line.startsWith('-')) {
        newLine += 1;
      }
    }
  }
  if (current && current.addedLines.length) targets.push(current);
  return targets.filter((t) => isCoverageRelevant(t.file));
}

/**
 * Diff-coverage evaluation.
 * @param {Record<string, Record<number, number>>} lcovMap  src/... -> { line: hits }
 * @param {Array<{file: string, addedLines: number[]}>} targets
 * @param {{threshold?: number}} options
 */
function evaluateDiffCoverage(lcovMap, targets, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const fileMetrics = [];
  const violations = [];

  for (const target of targets) {
    const rel = target.file.replace(/\\/g, '/');
    if (!isCoverageRelevant(rel)) continue;
    const lineHits = lcovMap[rel];
    const added = Array.from(new Set(target.addedLines || []));

    if (!lineHits) {
      // File not instrumented (excluded or contains no executable lines).
      fileMetrics.push({
        file: rel,
        changedExecutable: 0,
        changedCovered: 0,
        diff: 100,
        instrumented: false,
        meetsThreshold: true,
      });
      continue;
    }

    const executable = added.filter((ln) => Object.prototype.hasOwnProperty.call(lineHits, ln));
    const covered = executable.filter((ln) => lineHits[ln] > 0);
    const diff = executable.length > 0 ? (covered.length / executable.length) * 100 : 100;
    const meetsThreshold = executable.length === 0 || diff >= threshold;

    const metric = {
      file: rel,
      changedExecutable: executable.length,
      changedCovered: covered.length,
      diff: Number(diff.toFixed(2)),
      instrumented: true,
      meetsThreshold,
      uncoveredLines: executable.filter((ln) => lineHits[ln] === 0),
    };
    fileMetrics.push(metric);
    if (!meetsThreshold) violations.push(metric);
  }

  fileMetrics.sort((a, b) => a.file.localeCompare(b.file));
  return { threshold, fileMetrics, violations };
}

/**
 * Legacy whole-file evaluation kept for the summary table and backwards
 * compatibility with callers that still pass coverage-summary.json.
 */
function evaluateCoverage(summaryData, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const targetFiles = options.targetFiles || [];
  const rootDir = process.cwd();
  const fileMetrics = [];
  const violations = [];

  for (const [fullPath, metrics] of Object.entries(summaryData)) {
    if (fullPath === 'total') continue;
    const relativePath = path.isAbsolute(fullPath)
      ? normalizeToRelative(fullPath, rootDir)
      : fullPath.replace(/\\/g, '/');
    if (!isCoverageRelevant(relativePath)) continue;

    const linesPct = metrics.lines.pct;
    const stmtsPct = metrics.statements.pct;
    const meetsThreshold = linesPct >= threshold || stmtsPct >= threshold;
    const metric = {
      file: relativePath,
      lines: linesPct,
      statements: stmtsPct,
      branches: metrics.branches.pct,
      functions: metrics.functions.pct,
      meetsThreshold,
    };
    fileMetrics.push(metric);
    if (targetFiles.length > 0 && targetFiles.some((tf) => relativePath.includes(tf)) && !meetsThreshold) {
      violations.push(metric);
    }
  }

  fileMetrics.sort((a, b) => a.file.localeCompare(b.file));
  return { threshold, total: summaryData.total, fileMetrics, violations };
}

function generateMarkdownReport(evaluation) {
  const { threshold, total, fileMetrics, violations } = evaluation;
  const isDiff = fileMetrics.length > 0 && 'diff' in fileMetrics[0];

  let md = isDiff
    ? `### 📊 Enforced Test Coverage Audit (diff / changed lines)\n\n`
    : `### 📊 Enforced Test Coverage Audit\n\n`;
  md += `**Target Threshold:** \`${threshold}%\`${isDiff ? ' of added/changed lines covered' : ''}\n\n`;

  if (total) {
    md += `| Scope | Statements | Branches | Functions | Lines | Status |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    const linesPassed = total.lines.pct >= threshold;
    md += `| **Overall Codebase** | ${total.statements.pct}% | ${total.branches.pct}% | ${total.functions.pct}% | **${total.lines.pct}%** | ${linesPassed ? '✅ Passed' : '⚠️ Below Threshold'} |\n\n`;
  }

  if (isDiff) {
    md += `#### 📋 Changed-Line Coverage (per modified file)\n\n`;
    md += `| File | Changed Executable Lines | Covered | Diff % | Status |\n`;
    md += `| :--- | :---: | :---: | :---: | :---: |\n`;
    for (const m of fileMetrics) {
      const icon = m.meetsThreshold ? '✅' : '❌';
      if (!m.instrumented) {
        md += `| \`${m.file}\` | — | — | n/a | ✅ (no executable changes) |\n`;
      } else {
        md += `| \`${m.file}\` | ${m.changedExecutable} | ${m.changedCovered} | **${m.diff}%** | ${icon} |\n`;
      }
    }
    if (violations.length > 0) {
      md += `\n> [!CAUTION]\n`;
      md += `> **Coverage Threshold Failure**: ${violations.length} changed file(s) dropped below ${threshold}% on added lines:\n`;
      for (const v of violations) {
        const sample = (v.uncoveredLines || []).slice(0, 12).join(', ');
        md += `> - \`${v.file}\`: ${v.diff}% (${v.changedCovered}/${v.changedExecutable}); uncovered lines: ${sample}\n`;
      }
    } else {
      md += `\n> [!TIP]\n> All changed lines meet the ${threshold}% coverage threshold. ✅\n`;
    }
    return md;
  }

  // Whole-file (legacy) rendering.
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

function parseArgs() {
  const args = process.argv.slice(2);
  let threshold = DEFAULT_THRESHOLD;
  let lcovFile = path.resolve(process.cwd(), 'coverage/lcov.info');
  let summaryFile = path.resolve(process.cwd(), 'coverage/coverage-summary.json');
  let changedOnly = false;
  let baseRef = '';
  let targetFiles = [];
  let legacySummary = false;

  for (const arg of args) {
    if (arg.startsWith('--threshold=')) threshold = parseFloat(arg.split('=')[1]);
    else if (arg.startsWith('--lcov=')) lcovFile = path.resolve(process.cwd(), arg.split('=')[1]);
    else if (arg.startsWith('--file=')) {
      summaryFile = path.resolve(process.cwd(), arg.split('=')[1]);
      legacySummary = true;
    } else if (arg === '--changed-only') changedOnly = true;
    else if (arg.startsWith('--base=')) baseRef = arg.split('=')[1];
    else if (arg.startsWith('--target=')) targetFiles = arg.split('=')[1].split(',').map((f) => f.trim());
  }

  return { threshold, lcovFile, summaryFile, changedOnly, baseRef, targetFiles, legacySummary };
}

function run() {
  const { threshold, lcovFile, summaryFile, changedOnly, baseRef, targetFiles, legacySummary } = parseArgs();

  // Legacy whole-file mode: driven by an explicit coverage-summary.json via --file.
  // Retained for the `enforce-coverage` CLI tests and ad-hoc audits.
  if (legacySummary) {
    if (!fs.existsSync(summaryFile)) {
      console.error(`\u274c Coverage summary file not found at: ${summaryFile}`);
      process.exit(1);
    }
    const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const evaluation = evaluateCoverage(summaryData, { threshold, targetFiles });
    const report = generateMarkdownReport(evaluation);
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    fs.writeFileSync(path.resolve(process.cwd(), 'coverage-audit-report.md'), report, 'utf8');
    if (evaluation.violations.length > 0) {
      console.error(`\n\u274c [Coverage Threshold Violated]: target files dropped below ${threshold}%.`);
      process.exit(1);
    }
    console.log(`\n\u2705 Coverage audit completed successfully.`);
    return;
  }

  if (!fs.existsSync(lcovFile)) {
    console.error(`❌ LCOV file not found at: ${lcovFile}`);
    console.error(`Run "npm run test:coverage" (which emits lcov) before the coverage check.`);
    process.exit(1);
  }

  const lcovMap = loadLcov(lcovFile);

  let targets;
  if (changedOnly || targetFiles.length === 0) {
    targets = computeChangedTargetsFromGit(baseRef);
    console.log(`🔍 Evaluating diff coverage for ${targets.length} changed file(s)...`);
  } else {
    // Explicit file list without line info: derive added lines from git for each.
    targets = computeChangedTargetsFromGit(baseRef).filter((t) =>
      targetFiles.some((tf) => t.file.includes(tf)),
    );
    if (targets.length === 0) {
      // Fallback: treat every line of each named file as "changed".
      targets = targetFiles.filter(isCoverageRelevant).map((f) => {
        const rel = f.replace(/\\/g, '/');
        const abs = path.resolve(process.cwd(), rel);
        const count = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split(/\r?\n/).length : 0;
        return { file: rel, addedLines: Array.from({ length: count }, (_, i) => i + 1) };
      });
    }
  }

  const evaluation = evaluateDiffCoverage(lcovMap, targets, { threshold });

  // Attach the whole-codebase total (from summary) purely for the report header.
  if (fs.existsSync(summaryFile)) {
    try {
      evaluation.total = JSON.parse(fs.readFileSync(summaryFile, 'utf8')).total;
    } catch {
      /* ignore */
    }
  }

  const report = generateMarkdownReport(evaluation);
  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }
  fs.writeFileSync(path.resolve(process.cwd(), 'coverage-audit-report.md'), report, 'utf8');

  if (evaluation.violations.length > 0) {
    console.error(`\n❌ [Coverage Threshold Violated]: changed lines dropped below ${threshold}%.`);
    process.exit(1);
  }
  console.log(`\n✅ Coverage audit completed successfully.`);
}

if (require.main === module) {
  run();
}

module.exports = {
  evaluateCoverage,
  evaluateDiffCoverage,
  generateMarkdownReport,
  loadLcov,
  parseAddedLinesFromPatch,
  computeChangedTargetsFromGit,
  normalizeToRelative,
  isCoverageRelevant,
};
