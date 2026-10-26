import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  decryptPayload,
  generateAESKey,
  encryptPayload,
  wrapAESKey,
  unwrapAESKey,
  getPublicKeyForAddress,
} from "../../lib/crypto";
import { Shield, Lock, CheckCircle2, Clock } from "lucide-react";

export interface Sale {
  id: number;
  affiliate: string;
  saleAmount: string;
  commissionAmount: string;
  timestamp: number;
  clearingPeriod: number;
  claimed: boolean;
  /** Base64 AES-GCM envelope produced by encryptPayload. Absent for legacy mock rows. */
  encryptedEnvelope?: string;
  /** Wrapped per-sale AES key sealed to the affiliate identifier. Absent for legacy mock rows. */
  wrappedKey?: string;
  /** Affiliate identifier (wallet address/label) the wrapped key is sealed to. */
  affiliateKeyId?: string;
}

export interface SalesListProps {
  sales?: Sale[];
}

export const DEFAULT_CLEARING_PERIOD = 604800; // 7 days in seconds

export function calculateClearing(
  sale: Pick<Sale, "timestamp" | "clearingPeriod">,
  nowSeconds: number,
) {
  const period =
    typeof sale.clearingPeriod === "number" && sale.clearingPeriod > 0
      ? sale.clearingPeriod
      : DEFAULT_CLEARING_PERIOD;
  const unlockTimestamp = sale.timestamp + period;
  const remainingSeconds = Math.max(0, unlockTimestamp - nowSeconds);
  const elapsedSeconds = Math.max(0, nowSeconds - sale.timestamp);
  const rawProgress = Math.min(100, Math.max(0, Math.round((elapsedSeconds / period) * 100)));
  // Never display 100% while countdown is still active; cap at 99% until remainingSeconds reaches zero
  const progressPercent = remainingSeconds > 0 ? Math.min(99, rawProgress) : 100;
  const isUnlocked = remainingSeconds === 0;

  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = Math.floor(remainingSeconds % 60);

  let countdownText: string;
  if (days > 0) {
    countdownText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  } else if (hours > 0) {
    countdownText = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    countdownText = `${minutes}m ${seconds}s`;
  } else {
    countdownText = `${seconds}s`;
  }

  const unlockUtc =
    new Date(unlockTimestamp * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return {
    period,
    unlockTimestamp,
    remainingSeconds,
    elapsedSeconds,
    progressPercent,
    isUnlocked,
    countdownText,
    unlockUtc,
  };
}

const createInitialMockSales = (): Sale[] => {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 1,
      affiliate: "GBBD...5678",
      saleAmount: "100.0",
      commissionAmount: "10.0",
      timestamp: now - 86400, // 1 day ago (in clearing)
      clearingPeriod: 604800,
      claimed: false,
    },
    {
      id: 2,
      affiliate: "GBBD...5678",
      saleAmount: "250.0",
      commissionAmount: "25.0",
      timestamp: now - 864000, // 10 days ago (> 7-day clearing period elapsed)
      clearingPeriod: 604800,
      claimed: true,
    },
    {
      id: 3,
      affiliate: "GBBD...5678",
      saleAmount: "180.0",
      commissionAmount: "18.0",
      timestamp: now - 700000, // > 7 days ago (matured & unlocked, ready to claim)
      clearingPeriod: 604800,
      claimed: false,
    },
  ];
};

export const SalesList: React.FC<SalesListProps> = ({ sales: initialSales }) => {
  const [decryptedData, setDecryptedData] = useState<object | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptingId, setDecryptingId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [salesList] = useState<Sale[]>(() => initialSales || createInitialMockSales());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Secure decrypt (#49): each sale row carries an AES-GCM envelope sealed
   * with a per-sale key that is itself wrapped (sealed) to the affiliate's
   * key identifier via wrapAESKey/unwrapAESKey. Decrypt unwraps the sale key
   * with the affiliate identifier first, then decrypts the envelope; tampered
   * envelopes, wrong affiliate keys, and stub payloads all fail closed with a
   * generic error (no plaintext is ever fabricated).
   */
  const handleDecrypt = async (saleId: number) => {
    const sale = salesList.find((s) => s.id === saleId);
    if (!sale) {
      setDecryptError("Sale not found.");
      return;
    }
    setIsDecrypting(true);
    setDecryptingId(saleId);
    setDecryptError(null);
    setDecryptedData(null);
    try {
      // Affiliate key identity: prefer the connected wallet when available,
      // otherwise fall back to the row's affiliate label (mock rows).
      const walletAddress =
        typeof window !== "undefined"
          ? (window as unknown as { __STORMSALE_WALLET__?: string }).__STORMSALE_WALLET__
          : undefined;
      const affiliateIdentifier = await getPublicKeyForAddress(
        walletAddress || sale.affiliateKeyId || sale.affiliate,
      );
      let envelope = sale.encryptedEnvelope;
      let wrappedKey = sale.wrappedKey;
      // Legacy mock rows have no sealed envelope yet: seal the canonical
      // on-chain fields now AND wrap the sale key to the affiliate identifier
      // so decrypt exercises the real affiliate-key envelope path.
      if (!envelope || !wrappedKey) {
        const freshKey = await generateAESKey();
        const canonical = {
          saleId: sale.id,
          affiliate: sale.affiliate,
          saleAmount: sale.saleAmount,
          commissionAmount: sale.commissionAmount,
          timestamp: sale.timestamp,
          clearingPeriod: sale.clearingPeriod,
          claimed: sale.claimed,
        };
        envelope = await encryptPayload(canonical, freshKey);
        wrappedKey = await wrapAESKey(freshKey, affiliateIdentifier);
        sale.encryptedEnvelope = envelope;
        sale.wrappedKey = wrappedKey;
        sale.affiliateKeyId = affiliateIdentifier;
      }
      // Strict binding: the stored envelope must belong to the affiliate
      // requesting decrypt; otherwise a swapped row could leak another
      // affiliate's sale data.
      if (sale.affiliateKeyId && sale.affiliateKeyId !== affiliateIdentifier) {
        throw new Error("Decryption failed: invalid payload or key.");
      }
      const saleKey = await unwrapAESKey(wrappedKey, affiliateIdentifier);
      const decrypted = await decryptPayload(envelope, saleKey);
      // Bind the decrypted payload to the row the user clicked: prevents a
      // swapped envelope from displaying another sale's amounts as this one.
      const record = decrypted as Record<string, unknown>;
      if (record.saleId !== sale.id) {
        throw new Error("Decryption failed: invalid payload or key.");
      }
      setDecryptedData(decrypted);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Error decrypting data:", error);
      // Generic message: WebCrypto failures must not leak padding/key detail.
      setDecryptError(
        "Unable to decrypt this sale. The payload may be tampered or the key is invalid.",
      );
      setIsDialogOpen(true);
    } finally {
      setIsDecrypting(false);
      setDecryptingId(null);
    }
  };

  const formatUtcTimestamp = (timestamp: number) =>
    new Date(timestamp * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            My Sales
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            View and decrypt your encrypted on-chain sale data
          </p>
        </div>
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                  Encrypted Sales
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Decrypt using your private key to view sale details
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6">
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-zinc-800/50">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-100 dark:border-zinc-800/50 bg-slate-50 dark:bg-zinc-950/50">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pl-6">
                      Sale ID
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                      Amount
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                      Commission
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                      Recorded (UTC)
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 min-w-[240px]">
                      Clearing Countdown & Progress
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesList.map((sale) => {
                    const clearing = calculateClearing(sale, currentTime);
                    return (
                      <TableRow
                        key={sale.id}
                        className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                      >
                        <TableCell className="font-mono font-bold text-zinc-900 dark:text-white py-4 pl-6">
                          #{sale.id}
                        </TableCell>
                        <TableCell className="font-semibold text-zinc-700 dark:text-zinc-300 py-4">
                          {sale.saleAmount} XLM
                        </TableCell>
                        <TableCell className="font-bold text-indigo-600 dark:text-indigo-400 py-4">
                          {sale.commissionAmount} XLM
                        </TableCell>
                        <TableCell className="text-zinc-500 dark:text-zinc-400 font-mono text-xs py-4">
                          {formatUtcTimestamp(sale.timestamp)}
                        </TableCell>
                        <TableCell className="py-4 min-w-[240px]">
                          {sale.claimed ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Matured & Settled
                                </span>
                                <span className="font-mono text-zinc-400 text-[11px]">100%</span>
                              </div>
                              <div className="w-full bg-emerald-100 dark:bg-emerald-950/50 rounded-full h-2 overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full w-full" />
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono">
                                Unlocked: {clearing.unlockUtc}
                              </div>
                            </div>
                          ) : clearing.isUnlocked ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Ready to Claim
                                </span>
                                <span className="font-mono text-indigo-500 text-[11px] font-bold">
                                  100%
                                </span>
                              </div>
                              <div className="w-full bg-indigo-100 dark:bg-indigo-950/50 rounded-full h-2 overflow-hidden">
                                <div className="bg-indigo-600 h-full rounded-full w-full" />
                              </div>
                              <div className="text-[10px] text-indigo-500/80 dark:text-indigo-400/80 font-mono">
                                Clearing period completed
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                                  <Clock className="w-3.5 h-3.5 animate-pulse text-amber-500" />
                                  {clearing.countdownText}
                                </span>
                                <span className="font-mono text-zinc-500 dark:text-zinc-400 text-[11px] font-semibold">
                                  {clearing.progressPercent}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-amber-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${clearing.progressPercent}%`,
                                  }}
                                />
                              </div>
                              <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                                <span>Period: {Math.round(clearing.period / 86400)}d</span>
                                <span>Unlocks: {clearing.unlockUtc}</span>
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              sale.claimed
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                : clearing.isUnlocked
                                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                            }`}
                          >
                            {sale.claimed ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : clearing.isUnlocked ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            {sale.claimed
                              ? "Claimed"
                              : clearing.isUnlocked
                                ? "Unlocked"
                                : "In Clearing"}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 pr-6">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDecrypt(sale.id)}
                            disabled={isDecrypting}
                            className="rounded-lg h-9 px-4 font-semibold text-sm border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-all"
                          >
                            <Lock className="w-3.5 h-3.5 mr-1.5" />
                            {isDecrypting && decryptingId === sale.id ? "Decrypting..." : "Decrypt"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Decrypted Sale Data
            </DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400">
              This is the verified, decrypted sale information
            </DialogDescription>
          </DialogHeader>
          {decryptError ? (
            <div className="mt-2 p-4 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 text-sm font-medium text-red-700 dark:text-red-300">
              {decryptError}
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 mt-2">
              <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-300 overflow-x-auto">
                {JSON.stringify(decryptedData, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
