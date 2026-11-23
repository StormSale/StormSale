import type { VercelRequest, VercelResponse } from "@vercel/node";

const DNS_QUERY_ENDPOINT = "https://cloudflare-dns.com/dns-query";

interface DnsJsonAnswer {
  type?: number;
  data?: string;
}

interface DnsJsonResponse {
  Answer?: DnsJsonAnswer[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const domain =
    typeof req.query.domain === "string"
      ? req.query.domain.trim().toLowerCase().replace(/\.$/, "")
      : "";

  if (domain.length < 4 || domain.length > 253) {
    return res.status(400).json({ error: "Missing or invalid domain." });
  }

  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) {
    return res.status(400).json({ error: "Missing or invalid domain." });
  }

  try {
    const response = await fetch(
      `${DNS_QUERY_ENDPOINT}?name=${encodeURIComponent(domain)}&type=CNAME`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      throw new Error(`DNS provider returned HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DnsJsonResponse;
    const records = (payload.Answer ?? [])
      .filter((answer) => answer.type === 5 && typeof answer.data === "string")
      .map((answer) => (answer.data as string).trim().toLowerCase().replace(/\.$/, ""));

    return res.status(200).json({ domain, records });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DNS lookup failed";
    return res.status(502).json({ error: message });
  }
}
