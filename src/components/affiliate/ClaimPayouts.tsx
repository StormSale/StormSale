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
import { DollarSign, Zap, Clock, CheckCircle2 } from "lucide-react";

interface ClaimableSale {
  id: number;
  campaignAddress: string;
  saleAmount: string;
  commissionAmount: string;
  timestamp: number;
  clearingPeriod: number;
}

export const ClaimPayouts = () => {
  const isClaiming = false;

  const mockClaimableSales: ClaimableSale[] = [
    {
      id: 1,
      campaignAddress: "0xabc123...",
      saleAmount: "100.0",
      commissionAmount: "10.0",
      timestamp: Date.now() / 1000 - 1209600,
      clearingPeriod: 604800,
    },
    {
      id: 2,
      campaignAddress: "0xdef456...",
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
                        disabled={!isSaleClaimable(sale) || isClaiming}
                        className={`rounded-lg h-9 px-4 font-semibold text-sm transition-all ${
                          isSaleClaimable(sale)
                            ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-sm"
                            : "bg-slate-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1" />
                        Claim
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
