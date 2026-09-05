import { useState } from "react";
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
import { decryptPayload } from "../../lib/crypto";
import { Shield, Lock, CheckCircle2, Clock } from "lucide-react";

interface Sale {
  id: number;
  affiliate: string;
  saleAmount: string;
  commissionAmount: string;
  timestamp: number;
  claimed: boolean;
}

export const SalesList = () => {
  const [decryptedData, setDecryptedData] = useState<object | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const mockSales: Sale[] = [
    {
      id: 1,
      affiliate: "GBBD...5678",
      saleAmount: "100.0",
      commissionAmount: "10.0",
      timestamp: Date.now() / 1000 - 86400,
      claimed: false,
    },
    {
      id: 2,
      affiliate: "GBBD...5678",
      saleAmount: "250.0",
      commissionAmount: "25.0",
      timestamp: Date.now() / 1000 - 172800,
      claimed: true,
    },
  ];

  const handleDecrypt = async (_saleId: number) => {
    setIsDecrypting(true);
    try {
      const decrypted = await decryptPayload("STUB_ENCRYPTED_PAYLOAD", {} as CryptoKey);
      setDecryptedData(decrypted);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Error decrypting data:", error);
    } finally {
      setIsDecrypting(false);
    }
  };

  const formatTimestamp = (timestamp: number) => new Date(timestamp * 1000).toLocaleDateString();

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
                  {mockSales.map((sale) => (
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
                            sale.claimed
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                          }`}
                        >
                          {sale.claimed ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {sale.claimed ? "Claimed" : "Pending"}
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
                          {isDecrypting ? "Decrypting..." : "Decrypt"}
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
          <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 mt-2">
            <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-300 overflow-x-auto">
              {JSON.stringify(decryptedData, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
