import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Download, ShieldCheck } from "lucide-react";
import {
  PROOF_STEPS,
  InvalidIpError,
  buildClickRecord,
  buildGdprCertificate,
  verifyZeroPii,
  type ClickRecord,
} from "../../lib/privacy";

// Demo-only secret: the real master secret lives server-side and is never shipped to clients.
const DEMO_SECRET = "stormsale-demo-master-secret";

export const PrivacyVerification = () => {
  const [ip, setIp] = useState("203.0.113.7");
  const [records, setRecords] = useState<ClickRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const verification = verifyZeroPii(records);

  const hashSample = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await buildClickRecord("demo", ip, DEMO_SECRET, new Date());
      // The raw IP is discarded here; only the hashed record is kept.
      setRecords((prev) => [...prev, r]);
    } catch (e) {
      setError(
        e instanceof InvalidIpError
          ? "Enter a valid IPv4 or IPv6 address."
          : "Hashing failed. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };

  const downloadCertificate = () => {
    const text = buildGdprCertificate({
      organization: "StormSale Auditor Enterprise",
      issuedAt: new Date(),
      verification,
    });
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "stormsale-gdpr-certificate.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Privacy Verification
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Zero-PII click hashing: HMAC-SHA256(ip, daily_salt)
          </p>
        </div>
        <Button
          onClick={downloadCertificate}
          disabled={records.length === 0}
          className="h-10 rounded-xl font-semibold"
        >
          <Download className="w-4 h-4 mr-2" />
          GDPR Certificate
        </Button>
      </div>

      <p
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200"
      >
        Demo: this check only inspects the sample records created in this session with a public demo
        secret. It does not audit the database or ledger and is not a production privacy report or a
        formal GDPR/CCPA certification.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Proof of zero-PII architecture</CardTitle>
          <CardDescription>
            Hashes are stable within a UTC day, and irreversible only while the secret stays private
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {PROOF_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live verifier</CardTitle>
          <CardDescription>Hash a sample IP and inspect the stored record</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={ip} onChange={(e) => setIp(e.target.value)} aria-label="Sample IP" />
            <Button onClick={hashSample} disabled={pending}>
              {pending ? "Hashing..." : "Hash"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <pre className="text-xs overflow-x-auto rounded-lg bg-zinc-100 dark:bg-zinc-900 p-3">
            {JSON.stringify(records, null, 2)}
          </pre>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            {records.length} record(s) inspected,{" "}
            {verification.compliant ? "no raw IPs found in samples" : "raw IP detected"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
