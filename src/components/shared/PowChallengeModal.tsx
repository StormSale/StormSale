import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, AlertTriangle, RefreshCw, Cpu, CheckCircle } from "lucide-react";
import {
  type PoWChallenge,
  type PoWProof,
  createPoWChallenge,
  solvePoWChallengeInWorker,
  verifyPoWProof,
  consumePoWNonce,
} from "../../lib/powChallenge";

export interface PowChallengeModalProps {
  isOpen: boolean;
  difficulty?: number;
  timeoutMs?: number;
  onSuccess: (proof: PoWProof, singleUseNonce: string) => void;
  onClose: () => void;
}

export const PowChallengeModal: React.FC<PowChallengeModalProps> = ({
  isOpen,
  difficulty = 3,
  timeoutMs = 15000,
  onSuccess,
  onClose,
}) => {
  const [, setChallenge] = useState<PoWChallenge | null>(null);
  const [status, setStatus] = useState<"idle" | "solving" | "solved" | "expired" | "error">("idle");
  const [remainingMs, setRemainingMs] = useState(timeoutMs);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startChallenge = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const ac = new AbortController();
    abortControllerRef.current = ac;

    const newChallenge = createPoWChallenge({ difficulty, timeoutMs });
    setChallenge(newChallenge);
    setStatus("solving");
    setErrorMessage(null);
    setRemainingMs(timeoutMs);

    solvePoWChallengeInWorker(newChallenge, { timeoutMs, signal: ac.signal })
      .then((proof) => {
        const verification = verifyPoWProof(newChallenge, proof);
        if (!verification.valid) {
          setStatus("error");
          setErrorMessage(verification.reason || "Proof verification failed");
          return;
        }

        const singleUseNonce = `nonce_${proof.nonce}_${Math.random().toString(36).substring(2, 9)}`;
        const consumed = consumePoWNonce(newChallenge.id, singleUseNonce);
        if (!consumed) {
          setStatus("error");
          setErrorMessage("Single-use nonce reuse detected");
          return;
        }

        setStatus("solved");
        onSuccess(proof, singleUseNonce);
      })
      .catch((err: Error) => {
        if (ac.signal.aborted) return;
        if (err.message.includes("timed out") || Date.now() > newChallenge.expiresAt) {
          setStatus("expired");
          setErrorMessage("Challenge timed out. Please request a fresh challenge to continue.");
        } else {
          setStatus("error");
          setErrorMessage(err.message || "Failed to solve proof-of-work challenge");
        }
      });
  }, [difficulty, timeoutMs, onSuccess]);

  useEffect(() => {
    if (isOpen) {
      startChallenge();
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setStatus("idle");
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, startChallenge]);

  // Countdown timer effect
  useEffect(() => {
    if (status !== "solving") return;

    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 1000) {
          clearInterval(interval);
          setStatus("expired");
          setErrorMessage("Challenge timed out. Please request a fresh challenge to continue.");
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pow-modal-title"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 z-10"
        >
          <div className="flex items-center space-x-3 pb-4 border-b border-slate-100 dark:border-zinc-800">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 id="pow-modal-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Security Verification
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Lightweight Proof-of-Work Bot Defense
              </p>
            </div>
          </div>

          <div className="py-5 space-y-4">
            {status === "solving" && (
              <div className="text-center space-y-3">
                <div className="flex justify-center items-center">
                  <Cpu className="w-10 h-10 text-blue-500 animate-pulse" />
                </div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Verifying browser authenticity via background computation...
                </p>
                <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.max(5, (remainingMs / timeoutMs) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Difficulty: {difficulty} leading zeroes</span>
                  <span>Time remaining: {Math.ceil(remainingMs / 1000)}s</span>
                </div>
              </div>
            )}

            {status === "solved" && (
              <div className="text-center space-y-3 py-2">
                <div className="flex justify-center items-center text-emerald-500">
                  <CheckCircle className="w-12 h-12" />
                </div>
                <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Verification Complete
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Transaction submission unlocked with verified single-use nonce.
                </p>
              </div>
            )}

            {status === "expired" && (
              <div className="text-center space-y-4 py-2">
                <div className="flex justify-center items-center text-rose-500">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-rose-600 dark:text-rose-400">
                    Challenge Timed Out
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {errorMessage || "The 15-second challenge window expired before completion."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startChallenge}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Request Fresh Challenge
                </button>
              </div>
            )}

            {status === "error" && (
              <div className="text-center space-y-4 py-2">
                <div className="flex justify-center items-center text-rose-500">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-rose-600 dark:text-rose-400">
                    Verification Error
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {errorMessage}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startChallenge}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
