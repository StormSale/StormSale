import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, Cpu, Sparkles, CheckCircle2 } from "lucide-react";
import logo from "../../assets/logo2.png";

export interface IndigoBootLoaderProps {
  onComplete?: () => void;
  minDurationMs?: number;
  fast?: boolean;
}

const HYDRATION_STAGES = [
  {
    step: 1,
    title: "Initializing Cryptographic Session",
    detail: "Generating ephemeral session keys & zero-knowledge entropy...",
    icon: Lock,
  },
  {
    step: 2,
    title: "Verifying Soroban Escrow Protocol",
    detail: "Establishing RPC handshake with Stellar Testnet nodes...",
    icon: Cpu,
  },
  {
    step: 3,
    title: "Hydrating Security & Encryption Policies",
    detail: "Validating NIST ChaCha20-Poly1305 credentials vault...",
    icon: ShieldCheck,
  },
  {
    step: 4,
    title: "Decryption Complete & Ready",
    detail: "Session verified. Transitioning to dashboard environment...",
    icon: Sparkles,
  },
];

export const IndigoBootLoader: React.FC<IndigoBootLoaderProps> = ({
  onComplete,
  minDurationMs = 1200,
  fast = false,
}) => {
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (fast) {
      setProgress(100);
      setStageIndex(HYDRATION_STAGES.length - 1);
      const timer = setTimeout(() => {
        onComplete?.();
      }, 50);
      return () => clearTimeout(timer);
    }

    const totalDuration = Math.max(minDurationMs, 500);
    const stepInterval = 30;
    const totalSteps = totalDuration / stepInterval;
    const progressIncrement = 100 / totalSteps;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(prev + progressIncrement, 100);

        if (next < 30) {
          setStageIndex(0);
        } else if (next < 65) {
          setStageIndex(1);
        } else if (next < 95) {
          setStageIndex(2);
        } else {
          setStageIndex(3);
        }

        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onComplete?.();
          }, 180);
        }
        return next;
      });
    }, stepInterval);

    return () => clearInterval(interval);
  }, [fast, minDurationMs, onComplete]);

  const currentStage = HYDRATION_STAGES[stageIndex];
  const StageIcon = currentStage.icon;

  return (
    <motion.div
      data-testid="indigo-boot-loader"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#09090b] text-white selection:bg-indigo-500/30 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        scale: 0.98,
        filter: "blur(6px)",
        transition: { duration: 0.45, ease: "easeInOut" },
      }}
    >
      {/* Background ambient radial glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-[#0a0a14] to-[#04040a] pointer-events-none" />

      {/* Decorative concentric indigo radar rings */}
      <div className="absolute w-[560px] h-[560px] rounded-full border border-indigo-500/10 pointer-events-none animate-[pulse_4s_ease-in-out_infinite]" />
      <div className="absolute w-[380px] h-[380px] rounded-full border border-indigo-400/15 pointer-events-none" />
      <div className="absolute w-[220px] h-[220px] rounded-full border border-indigo-300/10 pointer-events-none" />

      {/* Dynamic blurred glow orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-tr from-indigo-600/25 via-indigo-500/15 to-violet-500/10 blur-[100px] rounded-full pointer-events-none animate-pulse" />

      {/* Center Branding Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-md w-full">
        {/* Animated Brand Logo with Glowing Halo */}
        <div className="relative mb-6">
          {/* Animated concentric pulse halo */}
          <motion.div
            className="absolute -inset-4 rounded-3xl bg-indigo-500/20 blur-xl pointer-events-none"
            animate={{
              opacity: [0.4, 0.85, 0.4],
              scale: [0.96, 1.05, 0.96],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Logo container with indigo border and glassmorphic surface */}
          <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-zinc-900/90 border border-indigo-500/40 shadow-[0_0_40px_rgba(99,102,241,0.35)] backdrop-blur-2xl">
            <motion.img
              src={logo}
              alt="StormSale Logo"
              className="w-16 sm:w-20 h-auto object-contain drop-shadow-[0_0_20px_rgba(99,102,241,0.7)]"
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Orbiting glowing dot */}
            <motion.div
              className="absolute -inset-1 rounded-3xl border border-indigo-400/30"
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_#818cf8]" />
            </motion.div>
          </div>
        </div>

        {/* Brand Name Typography */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-2 mb-6"
        >
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center justify-center gap-2">
            <span className="bg-gradient-to-r from-white via-indigo-100 to-indigo-400 bg-clip-text text-transparent">
              StormSale
            </span>
          </h1>

          {/* Category: Security & Encryption Tag */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 shadow-sm shadow-indigo-500/10">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="tracking-wide uppercase font-mono">
              Security &amp; Encryption Hydration
            </span>
          </div>
        </motion.div>

        {/* Hydration Progress Bar */}
        <div className="w-full max-w-xs space-y-3 mb-6">
          <div className="relative h-2 w-full bg-zinc-900/90 rounded-full overflow-hidden border border-indigo-500/30 shadow-inner">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600 rounded-full shadow-[0_0_14px_rgba(99,102,241,0.9)]"
              style={{ width: `${progress}%` }}
              transition={{ ease: "easeOut", duration: 0.1 }}
            />
          </div>

          {/* Progress Percent and Status */}
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5 text-indigo-300">
              <StageIcon className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="font-medium truncate max-w-[190px]">{currentStage.title}</span>
            </span>
            <span className="font-bold text-zinc-200">{Math.round(progress)}%</span>
          </div>

          <p className="text-[11px] text-zinc-500 font-mono text-left truncate">
            {currentStage.detail}
          </p>
        </div>

        {/* Cryptographic Protocol Badges */}
        <div className="flex items-center justify-center gap-3 text-[10px] text-zinc-500 font-mono pt-2 border-t border-zinc-800/60 w-full max-w-xs">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Stellar Soroban v22
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> ChaCha20-Poly1305
          </span>
        </div>

        {/* Quick Launch Skip for Immediate Access */}
        <button
          onClick={() => onComplete?.()}
          className="mt-6 text-[11px] font-mono text-zinc-500 hover:text-indigo-400 transition-colors underline underline-offset-4"
        >
          Skip to Dashboard →
        </button>
      </div>
    </motion.div>
  );
};
