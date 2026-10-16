import { useState, useCallback, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
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
import { DollarSign, Zap, Clock, CheckCircle2 } from "lucide-react";

interface Sep24AnchorInfo {
  transferServerSep24: string;
  webAuthEndpoint?: string;
  signingKey?: string;
}

interface Sep24Transaction {
  id: string;
  kind: "deposit" | "withdrawal";
  status: "incomplete" | "pending_user_transfer_start" | "pending_anchor" | "pending_stellar" | "pending_trust" | "pending_user" | "completed" | "refunded" | "expired" | "error" | "no_market" | "too_small" | "too_large";
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  started_at?: string;
  completed_at?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  message?: string;
  more_info_url?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
  to?: string;
  from?: string;
}

interface ClaimableSale {
  id: number;
  campaignAddress: string;
  saleAmount: string;
  commissionAmount: string;
  timestamp: number;
  clearingPeriod: number;
}

const ANCHOR_TOML_URL =
  import.meta.env.VITE_SEP24_ANCHOR_TOML_URL ||
  "https://testanchor.stellar.org/.well-known/stellar.toml";

const SEP24_POLL_INTERVAL_MS = 4000;
const SEP24_POLL_TIMEOUT_MS = 15 * 60 * 1000;

export const ClaimPayouts = () => {
  const { claimPayoutOnChain } = useWeb3();
  const { showNotification } = useNotification();
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [anchorInfo, setAnchorInfo] = useState<Sep24AnchorInfo | null>(null);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [activeTx, setActiveTx] = useState<Sep24Transaction | null>(null);
  const [receipt, setReceipt] = useState<Sep24Transaction | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);

  const handleClaim = async (saleId: number) => {
    setClaimingId(saleId);
    try {
      showNotification({
        type: "info",
        title: "Claiming Commission",
        message: "Submitting payout request to Soroban contract...",
      });

      const res = await claimPayoutOnChain(saleId);
      showNotification({
        type: "success",
        title: "Commission Paid Out!",
        message: `Settled on Stellar ledger. Tx: ${res.txHash ? res.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Claim Failed",
        message: err.message || "Failed to claim payout",
      });
    } finally {
      setClaimingId(null);
    }
  };

  const discoverAnchor = useCallback(async (): Promise<Sep24AnchorInfo> => {
    if (anchorInfo) return anchorInfo;
    setAnchorLoading(true);
    try {
      const res = await fetch(ANCHOR_TOML_URL, { headers: { Accept: "text/plain" } });
      if (!res.ok) throw new Error(`Failed to fetch anchor TOML (${res.status})`);
      const toml = await res.text();
      const transferServerMatch = toml.match(/^\s*TRANSFER_SERVER_SEP0024\s*=\s*"([^"]+)"/m);
      const webAuthMatch = toml.match(/^\s*WEB_AUTH_ENDPOINT\s*=\s*"([^"]+)"/m);
      const signingKeyMatch = toml.match(/^\s*SIGNING_KEY\s*=\s*"([^"]+)"/m);
      if (!transferServerMatch) {
        throw new Error("Anchor TOML missing TRANSFER_SERVER_SEP0024");
      }
      const info: Sep24AnchorInfo = {
        transferServerSep24: transferServerMatch[1],
        webAuthEndpoint: webAuthMatch?.[1],
        signingKey: signingKeyMatch?.[1],
      };
      setAnchorInfo(info);
      return info;
    } finally {
      setAnchorLoading(false);
    }
  }, [anchorInfo]);

  const pollTransaction = useCallback(
    async (info: Sep24AnchorInfo, txId: string, token: string) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < SEP24_POLL_TIMEOUT_MS) {
        const url = `${info.transferServerSep24}/transaction?id=${encodeURIComponent(txId)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Anchor status check failed (${res.status})`);
        const data = (await res.json()) as { transaction?: Sep24Transaction };
        const tx = data.transaction;
        if (!tx) throw new Error("Anchor returned no transaction");
        setActiveTx(tx);
        if (
          tx.status === "completed" ||
          tx.status === "refunded" ||
          tx.status === "expired" ||
          tx.status === "error"
        ) {
          return tx;
        }
        await new Promise((r) => setTimeout(r, SEP24_POLL_INTERVAL_MS));
      }
      throw new Error("Timed out waiting for anchor to complete withdrawal");
    },
    []
  );

  const handleSep24Withdraw = async (sale: ClaimableSale) => {
    setWithdrawingId(sale.id);
    try {
      showNotification({
        type: "info",
        title: "Discovering Anchor",
        message: "Fetching SEP-0024 anchor configuration...",
      });
      const info = await discoverAnchor();

      const token = `sep24-${sale.id}-${Date.now()}`;
      const body = new URLSearchParams({
        asset_code: "USDC",
        account: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
        amount: sale.commissionAmount,
        lang: "en",
      });
      const initRes = await fetch(`${info.transferServerSep24}/transactions/withdraw/interactive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${token}`,
        },
        body: body.toString(),
      });
      if (!initRes.ok) {
        throw new Error(`Anchor interactive withdrawal init failed (${initRes.status})`);
      }
      const initData = (await initRes.json()) as {
        type?: string;
        url?: string;
        id?: string;
      };
      if (!initData.url || !initData.id) {
        throw new Error("Anchor did not return an interactive URL");
      }

      setPopupUrl(initData.url);
      setPopupOpen(true);
      showNotification({
        type: "info",
        title: "Complete Bank Details",
        message: "Enter your local bank account details in the anchor popup.",
      });

      const finalTx = await pollTransaction(info, initData.id, token);
      setPopupOpen(false);
      setPopupUrl(null);

      if (finalTx.status === "completed") {
        setReceipt(finalTx);
        showNotification({
          type: "success",
          title: "Fiat Payout Sent",
          message: `Reference: ${finalTx.external_transaction_id || finalTx.id}`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Withdrawal Not Completed",
          message: finalTx.message || `Anchor status: ${finalTx.status}`,
        });
      }
    } catch (err: any) {
      setPopupOpen(false);
      setPopupUrl(null);
      showNotification({
        type: "error",
        title: "SEP-0024 Withdrawal Failed",
        message: err.message || "Failed to withdraw to local bank",
      });
    } finally {
      setWithdrawingId(null);
    }
  };

  useEffect(() => {
    if (!popupOpen) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "sep24_close") {
        setPopupOpen(false);
        setPopupUrl(null);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [popupOpen]);

  const mockClaimableSales: ClaimableSale[] = [
    {
      id: 1,
      campaignAddress: "CA7QW5KXGPTR4N2K9J2...",
      saleAmount: "100.0",
      commissionAmount: "10.0",
      timestamp: Date.now() / 1000 - 1209600,
      clearingPeriod: 604800,
    },
    {
      id: 2,
      campaignAddress: "CB4RN8XJLP8M1K3V6P7...",
      saleAmount: "250.0",
      commissionAmount: "25.0",
      timestamp: Date.now() / 1000 - 864000,
      clearingPeriod: 604800,
    },
  ];

  const isSaleClaimable = (sale: ClaimableSale) => {
    return Date.now() / 1000 >= sale.timestamp + sale.clearingPeriod;
  };

  const formatTimestamp = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString();

  const getTimeRemaining = (sale: ClaimableSale) => {
    const remaining = sale.timestamp + sale.clearingPeriod - Date.now() / 1000;
    if (remaining <= 0) return "Ready to claim";
    const days = Math.ceil(remaining / 86400);
    return `${days} day${days !== 1 ? "s" : ""} remaining`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Claim Payouts
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Claim commissions after the on-chain clearing period has ended
        </p>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm font-medium">
          Withdraw to Local Bank (SEP-0024)
        </p>
      </div>
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <DollarSign className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Claimable Commissions
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Sales past the clearing period are ready to withdraw
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
                    Date
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6">
                    Action
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6">
                    Fiat Payout
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockClaimableSales.map((sale) => (
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
                    <TableCell className="text-zinc-500 dark:text-zinc-400 font-medium py-4">
                      {formatTimestamp(sale.timestamp)}
                    </TableCell>
                    <TableCell className="py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isSaleClaimable(sale)
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                        }`}
                      >
                        {isSaleClaimable(sale) ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {getTimeRemaining(sale)}
                      </span>
                    </TableCell>
                    <TableCell className="py-4 pr-6">
                      <Button
                        size="sm"
                        onClick={() => handleClaim(sale.id)}
                        disabled={!isSaleClaimable(sale) || claimingId !== null}
                        className={`rounded-lg h-9 px-4 font-semibold text-sm transition-all ${
                          isSaleClaimable(sale)
                            ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-sm"
                            : "bg-slate-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1" />
                        {claimingId === sale.id ? "Claiming..." : "Claim"}
                      </Button>
                    </TableCell>
                    <TableCell className="py-4 pr-6">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSep24Withdraw(sale)}
                        disabled={!isSaleClaimable(sale) || withdrawingId !== null || anchorLoading}
                        className="rounded-lg h-9 px-4 font-semibold text-sm border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      >
                        {withdrawingId === sale.id
                          ? "Withdrawing..."
                          : "Withdraw to Local Bank (SEP-0024)"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {popupOpen && popupUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl h-[80vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                SEP-0024 Anchor — Bank Withdrawal
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPopupOpen(false);
                  setPopupUrl(null);
                }}
              >
                Close
              </Button>
            </div>
            <iframe
              title="SEP-0024 Anchor Interactive Withdrawal"
              src={popupUrl}
              className="flex-1 w-full border-0"
              allow="clipboard-write"
            />
          </div>
        </div>
      )}

      {receipt && (
        <Card className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 rounded-3xl">
          <CardHeader className="pt-6 px-8 pb-4">
            <CardTitle className="text-lg font-bold text-emerald-800 dark:text-emerald-300">
              Fiat Payout Confirmation
            </CardTitle>
            <CardDescription className="text-emerald-700 dark:text-emerald-400">
              Your local bank payout has been submitted by the anchor.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-0 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                Fiat Payout Reference
              </span>
              <span className="font-mono font-bold text-emerald-900 dark:text-emerald-200">
                {receipt.external_transaction_id || receipt.id}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                Anchor Transaction ID
              </span>
              <span className="font-mono text-emerald-900 dark:text-emerald-200">
                {receipt.id}
              </span>
            </div>
            {receipt.amount_out && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Amount Out
                </span>
                <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                  {receipt.amount_out}
                </span>
              </div>
            )}
            {receipt.completed_at && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                  Completed At
                </span>
                <span className="text-emerald-900 dark:text-emerald-200">
                  {new Date(receipt.completed_at).toLocaleString()}
                </span>
              </div>
            )}
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReceipt(null)}
                className="rounded-lg"
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
