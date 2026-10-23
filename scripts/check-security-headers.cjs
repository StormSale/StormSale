/**
 * StormSale Security Headers Verification Script
 *
 * Implements Issue #215: [infra] Strict Security Headers
 * - Verifies that the deployment configs (vercel.json, nginx.conf) declare every
 *   required security header with the exact expected value.
 * - Optionally verifies the headers of a live deployment (the `curl -I` equivalent).
 * - Exits non-zero when a header is missing or malformed.
 *
 * Usage:
 *   node scripts/check-security-headers.cjs
 *   node scripts/check-security-headers.cjs --url=https://example.com
 */

const fs = require("fs");
const path = require("path");

const REQUIRED_SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const ROOT_DIR = path.resolve(__dirname, "..");
const VERCEL_CONFIG_PATH = path.join(ROOT_DIR, "vercel.json");
const NGINX_CONFIG_PATH = path.join(ROOT_DIR, "nginx.conf");

function parseArgs() {
  const args = process.argv.slice(2);
  let url = null;
  for (const arg of args) {
    if (arg.startsWith("--url=")) {
      url = arg.slice("--url=".length);
    }
  }
  return { url };
}

/** Header values are compared case-insensitively and whitespace-insensitively. */
function normalizeHeaderValue(value) {
  return String(value === null || value === undefined ? "" : value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Reads the headers declared by vercel.json.
 * The `/(.*)` block applies to every route, which is the one that must carry
 * the security headers.
 */
function readVercelHeaders(configPath = VERCEL_CONFIG_PATH) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const blocks = Array.isArray(config.headers) ? config.headers : [];
  const applicable = blocks.find((block) => block.source === "/(.*)") || blocks[0];
  if (!applicable) return {};

  const headers = {};
  for (const header of applicable.headers || []) {
    headers[header.key] = { value: header.value, always: true };
  }
  return headers;
}

/**
 * Reads the headers declared by nginx.conf.
 * `always` is tracked separately so the audit can flag headers that are not
 * emitted on error responses (4xx / 5xx).
 */
function readNginxHeaders(configPath = NGINX_CONFIG_PATH) {
  const contents = fs.readFileSync(configPath, "utf8");
  const headers = {};
  const directive = /add_header\s+([A-Za-z0-9-]+)\s+"([^"]*)"(\s+always)?\s*;/g;

  let match = directive.exec(contents);
  while (match !== null) {
    headers[match[1]] = { value: match[2], always: Boolean(match[3]) };
    match = directive.exec(contents);
  }
  return headers;
}

/**
 * Compares a header map against the required security headers.
 */
function evaluateHeaders(headers) {
  return REQUIRED_SECURITY_HEADERS.map((required) => {
    const entry = headers[required.key];
    const present = entry !== undefined && entry !== null;
    const actualValue = present ? entry.value : null;
    const matches =
      present && normalizeHeaderValue(actualValue) === normalizeHeaderValue(required.value);
    const always = present ? entry.always !== false : false;

    return {
      key: required.key,
      expected: required.value,
      actual: actualValue,
      present,
      matches,
      always,
      ok: present && matches && always,
    };
  });
}

function checkVercelConfig(configPath = VERCEL_CONFIG_PATH) {
  return evaluateHeaders(readVercelHeaders(configPath));
}

function checkNginxConfig(configPath = NGINX_CONFIG_PATH) {
  return evaluateHeaders(readNginxHeaders(configPath));
}

/**
 * Fetches the response headers of a live deployment, following redirects the
 * same way `curl -IL` would.
 */
async function fetchLiveHeaders(url, maxRedirects = 5) {
  let current = url;

  for (let attempt = 0; attempt <= maxRedirects; attempt++) {
    const response = await fetch(current, { method: "HEAD", redirect: "manual" });
    const location = response.headers.get("location");

    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }

    const headers = {};
    for (const [key, value] of response.headers) {
      headers[key] = { value, always: true };
    }
    return headers;
  }

  throw new Error(`Too many redirects while checking ${url}`);
}

async function checkLiveUrl(url) {
  return evaluateHeaders(await fetchLiveHeaders(url));
}

function generateMarkdownReport(sections) {
  let md = `### 🔐 Security Headers Audit\n\n`;

  for (const section of sections) {
    const failures = section.results.filter((result) => !result.ok).length;
    md += `#### ${section.title}\n\n`;
    md += `| Header | Expected | Actual | Status |\n`;
    md += `| :--- | :--- | :--- | :---: |\n`;

    for (const result of section.results) {
      const actual = result.actual === null ? "_missing_" : `\`${result.actual}\``;
      const status = result.ok ? "✅" : !result.present ? "❌ Missing" : "❌ Mismatch";
      md += `| \`${result.key}\` | \`${result.expected}\` | ${actual} | ${status} |\n`;
    }

    md += `\n${failures === 0 ? "✅ All required headers present" : `❌ ${failures} header(s) failing`}\n\n`;
  }

  return md;
}

async function run() {
  const { url } = parseArgs();

  const sections = [
    { title: "`vercel.json`", results: checkVercelConfig() },
    { title: "`nginx.conf`", results: checkNginxConfig() },
  ];

  if (url) {
    sections.push({ title: `Live deployment (\`${url}\`)`, results: await checkLiveUrl(url) });
  }

  const report = generateMarkdownReport(sections);
  console.log(report);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }

  const failures = sections.flatMap((section) => section.results).filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(`\n❌ [Security Header Violation]: ${failures.length} check(s) failed.`);
    for (const failure of failures) {
      console.error(`   - ${failure.key}: expected "${failure.expected}", got "${failure.actual}"`);
    }
    process.exit(1);
  }

  console.log(`\n✅ Security headers audit completed successfully.`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`❌ Security headers audit failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  REQUIRED_SECURITY_HEADERS,
  VERCEL_CONFIG_PATH,
  NGINX_CONFIG_PATH,
  normalizeHeaderValue,
  readVercelHeaders,
  readNginxHeaders,
  evaluateHeaders,
  checkVercelConfig,
  checkNginxConfig,
  fetchLiveHeaders,
  checkLiveUrl,
  generateMarkdownReport,
};
