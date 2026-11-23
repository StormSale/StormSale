import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getDisputes, createDisputeTicket, type DisputeTicket } from "../../lib/disputesManager";
import { ShieldAlert, CheckCircle, Clock, AlertTriangle, Send } from "lucide-react";

export const DisputesManager: React.FC = () => {
  const [disputes, setDisputes] = useState<DisputeTicket[]>(() => getDisputes());
  const [txHash, setTxHash] = useState("");
  const [reason, setReason] = useState("unpaid_commission");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("120 XLM");
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadDisputes = () => {
    setDisputes(getDisputes());
  };

  useEffect(() => {
    const handleUpdate = () => loadDisputes();
    window.addEventListener("stormsale:disputes:updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("stormsale:disputes:updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txHash.trim() || !description.trim()) {
      setFeedback("Please fill in both transaction hash and description.");
      return;
    }

    createDisputeTicket({
      txHash,
      reason,
      description,
      amount,
    });

    setTxHash("");
    setDescription("");
    setFeedback("Dispute ticket submitted successfully! 48h SLA clock started.");
    loadDisputes();
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-amber-500" />
          Affiliate Dispute & Mediation Hub
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Submit dispute tickets for unpaid commissions or missing attribution. Advertisers are
          bound by a 48h resolution SLA.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ticket Submission Form */}
        <Card className="lg:col-span-1 border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-500" />
              Submit Dispute Ticket
            </CardTitle>
            <CardDescription className="text-xs">
              Provide proof of referral or conversion transaction on Stellar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                    feedback.includes("success")
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                      : "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {feedback}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Transaction Hash
                </label>
                <Input
                  data-testid="input-dispute-txhash"
                  placeholder="e.g. 7a9b0c1d2e3f... or Stellar txHash"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  className="text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Dispute Reason
                </label>
                <select
                  data-testid="select-dispute-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="unpaid_commission">Unpaid Commission</option>
                  <option value="tracking_error">Tracking / Attribution Error</option>
                  <option value="escrow_timeout">Escrow Clearance Timeout</option>
                  <option value="other">Other Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Commission Amount Claimed
                </label>
                <Input
                  data-testid="input-dispute-amount"
                  placeholder="e.g. 120 XLM"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Detailed Description & Proof
                </label>
                <textarea
                  data-testid="textarea-dispute-description"
                  placeholder="Explain why commission is due, client wallet address, and timestamp..."
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[90px]"
                  required
                />
              </div>

              <Button
                type="submit"
                data-testid="btn-submit-dispute"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all"
              >
                Submit Dispute Ticket
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Existing Disputes List */}
        <Card className="lg:col-span-2 border-slate-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-500" />
                  Your Dispute Tickets
                </CardTitle>
                <CardDescription className="text-xs">
                  Active dispute tickets and mediation decisions.
                </CardDescription>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800">
                {disputes.length} Total
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {disputes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No active or historical dispute tickets found.
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map((ticket) => (
                  <div
                    key={ticket.id}
                    data-testid={`dispute-row-${ticket.id}`}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          data-testid={`dispute-status-${ticket.id}`}
                          data-status={ticket.status}
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase border ${
                            ticket.status === "RESOLVED"
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                              : "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                          }`}
                        >
                          {ticket.status}
                        </span>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                          {ticket.reason.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          Claim: {ticket.amount}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {ticket.status === "RESOLVED" ? (
                          <span className="text-emerald-500 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Escrow Released & Resolved
                          </span>
                        ) : (
                          <span className="text-amber-500 font-semibold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            48h SLA Clock Active
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all bg-white dark:bg-zinc-900 p-2 rounded-xl border border-slate-200 dark:border-zinc-800">
                      Tx: {ticket.txHash}
                    </div>

                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{ticket.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
