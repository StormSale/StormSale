/**
 * GET /api/affiliate/issues
 * POST /api/affiliate/issues
 *
 * Report metadata is persisted in the existing Upstash Redis database.
 * Requests are authenticated with a fresh SEP-53 wallet signature. Evidence
 * uploads and advertiser status changes are intentionally not accepted until
 * private object storage and a trusted campaign-owner contract are configured.
 */
import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { affiliateIssueDraftSchema, affiliateIssueReportSchema } from "../../src/lib/validation";
import {
  verifyAffiliateIssueProof,
  type AffiliateIssueAction,
  type AffiliateIssueProof,
  type AffiliateIssueSubmission,
} from "../../src/lib/affiliateIssueAuth";
import type { AffiliateIssueReport } from "../../src/utils/affiliateIssuesApi";
import {
  affiliateIssueProofKey,
  affiliateIssueRateLimitKey,
  affiliateIssueReportKey,
  affiliateIssueReportsKey,
  getRedisClient,
} from "../_lib/redis";

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 15 * 60;
const MAX_REPORTS_PER_RESPONSE = 100;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
};

function headerValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function readProof(req: VercelRequest, action: AffiliateIssueAction): AffiliateIssueProof {
  const timestampText = headerValue(req.headers["x-stormsale-timestamp"]);
  const timestamp = /^\d{1,16}$/.test(timestampText) ? Number(timestampText) : Number.NaN;
  return {
    action,
    wallet: headerValue(req.headers["x-stormsale-wallet"]),
    timestamp,
    signature: headerValue(req.headers["x-stormsale-signature"]),
  };
}

function parseSubmission(body: unknown): AffiliateIssueSubmission | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const allowedFields = new Set(["campaignId", "saleDate", "expectedSaleAmount", "details"]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) return null;
  const parsed = affiliateIssueDraftSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function isValidStoredReport(value: unknown): value is AffiliateIssueReport {
  return affiliateIssueReportSchema.safeParse(value).success;
}

async function consumeRateLimit(wallet: string, action: AffiliateIssueAction): Promise<boolean> {
  const redis = getRedisClient();
  const key = affiliateIssueRateLimitKey(wallet, action);
  const results = (await redis.multi().incr(key).expire(key, RATE_WINDOW_SECONDS, "NX").exec()) as [
    number,
    0 | 1,
  ];
  const count = results?.[0] ?? 0;
  return count <= RATE_LIMIT;
}

async function authenticate(
  req: VercelRequest,
  action: AffiliateIssueAction,
  payload?: AffiliateIssueSubmission,
): Promise<AffiliateIssueProof | null> {
  const proof = readProof(req, action);
  return verifyAffiliateIssueProof(proof, action, payload) ? proof : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (req.method === "GET") {
    const proof = await authenticate(req, "read");
    if (!proof) return res.status(401).json({ error: "A fresh wallet signature is required." });

    try {
      if (!(await consumeRateLimit(proof.wallet, "read"))) {
        res.setHeader("Retry-After", String(RATE_WINDOW_SECONDS));
        return res.status(429).json({ error: "Too many report requests. Try again later." });
      }

      const redis = getRedisClient();
      const ids = await redis.smembers(affiliateIssueReportsKey(proof.wallet));
      const reports = await Promise.all(
        ids.map((id) => redis.get<unknown>(affiliateIssueReportKey(String(id)))),
      );
      if (reports.some((report) => !isValidStoredReport(report))) {
        throw new Error("Stored affiliate issue report data is invalid.");
      }

      const orderedReports = (reports as AffiliateIssueReport[])
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, MAX_REPORTS_PER_RESPONSE);
      return res.status(200).json(orderedReports);
    } catch (error) {
      console.error(
        "[affiliate/issues:GET]",
        error instanceof Error ? error.message : "Unknown storage error",
      );
      return res.status(503).json({ error: "Issue reports are temporarily unavailable." });
    }
  }

  const contentType = headerValue(req.headers["content-type"]).toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return res.status(503).json({
      error: "Private evidence storage is not configured. No files were accepted or stored.",
    });
  }
  if (!contentType.includes("application/json")) {
    return res.status(415).json({ error: "Submit report metadata as application/json." });
  }

  const submission = parseSubmission(req.body);
  if (!submission) {
    return res.status(400).json({ error: "Invalid issue report fields." });
  }

  const proof = await authenticate(req, "submit", submission);
  if (!proof) return res.status(401).json({ error: "A fresh wallet signature is required." });

  try {
    if (!(await consumeRateLimit(proof.wallet, "submit"))) {
      res.setHeader("Retry-After", String(RATE_WINDOW_SECONDS));
      return res.status(429).json({ error: "Too many report submissions. Try again later." });
    }

    const redis = getRedisClient();
    const canonicalSignature = Buffer.from(proof.signature, "base64").toString("base64");
    const claimed = await redis.set(affiliateIssueProofKey(canonicalSignature), proof.wallet, {
      nx: true,
      ex: RATE_WINDOW_SECONDS,
    });
    if (claimed === null) {
      return res.status(401).json({ error: "This signature has already been used." });
    }

    const report: AffiliateIssueReport = {
      id: randomUUID(),
      affiliateAddress: proof.wallet,
      ...submission,
      attachmentCount: 0,
      status: "submitted",
      createdAt: new Date().toISOString(),
    };
    const validReport = affiliateIssueReportSchema.safeParse(report);
    if (!validReport.success) {
      throw new Error("Generated affiliate issue report did not match its schema.");
    }

    const [setResult] = (await redis
      .multi()
      .set(affiliateIssueReportKey(report.id), report, { nx: true })
      .sadd(affiliateIssueReportsKey(proof.wallet), report.id)
      .exec()) as [string | null, number];

    if (setResult === null) {
      throw new Error("Report ID collision or failed atomic write.");
    }
    return res.status(201).json(report);
  } catch (error) {
    console.error(
      "[affiliate/issues:POST]",
      error instanceof Error ? error.message : "Unknown storage error",
    );
    return res.status(503).json({ error: "Issue reports are temporarily unavailable." });
  }
}
