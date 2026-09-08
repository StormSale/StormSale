import { useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { useWeb3 } from "../hooks/useWeb3";
import { ThemeToggle } from "../components/shared/ThemeToggle";
import {
  Shield,
  Zap,
  ArrowRight,
  Star,
  Lock,
  Timer,
  Coins,
  Code2,
  Cpu,
  Menu,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "../assets/logo2.png";

export const Landing = () => {
  const { openWalletModal } = useWeb3();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const stats = [
    { value: "500+", label: "Active Campaigns" },
    { value: "$2.5M+", label: "Total Commissions" },
    { value: "10K+", label: "Happy Affiliates" },
    { value: "99.9%", label: "Uptime" },
  ];

  const testimonials = [
    {
      name: "Sarah Chen",
      role: "Advertiser",
      content:
        "StormSale revolutionized our affiliate program. The encryption gives us peace of mind.",
      avatar: "https://i.pravatar.cc/150?u=sarah",
      gradient: "from-blue-500 to-cyan-400",
    },
    {
      name: "Mike Rodriguez",
      role: "Affiliate",
      content: "Earned over $50K in commissions securely. The platform is incredibly reliable.",
      avatar: "https://i.pravatar.cc/150?u=mike",
      gradient: "from-emerald-500 to-teal-400",
    },
    {
      name: "Emily Watson",
      role: "Enterprise Client",
      content: "NIST compliance was crucial for us. StormSale delivered beyond expectations.",
      avatar: "https://i.pravatar.cc/150?u=emily",
      gradient: "from-purple-500 to-pink-400",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Background Grid Noise */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle at center, #000 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      ></div>
      <div className="fixed inset-0 z-0 pointer-events-none bg-gradient-to-b from-transparent via-slate-50/50 to-slate-100/80 dark:from-transparent dark:via-zinc-950/50 dark:to-zinc-950/80"></div>

      {/* Header */}
      <header className="relative z-10 container mx-auto px-4 py-6">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex justify-between items-center bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border border-slate-200/50 dark:border-zinc-800/50 p-3 rounded-3xl shadow-sm"
        >
          <div className="flex items-center pl-2">
            <a href="/" className="flex items-center space-x-3 group">
              <img
                src={logo}
                alt="StormSale Icon"
                className="h-10 md:h-12 object-contain group-hover:scale-105 transition-transform duration-500"
              />
              <div className="flex flex-col justify-center">
                <span className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tighter leading-none">
                  StormSale
                </span>
                <span className="hidden md:block text-[10px] font-bold text-sky-500 tracking-wider uppercase mt-1 leading-none">
                  Storm the market. Break the prices.
                </span>
              </div>
            </a>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-6 mr-4">
            {[
              "Home",
              "About Us",
              "Features",
              "How it Works",
              "Pricing",
              "Stats",
              "FAQ",
              "Contact",
            ].map((item) => (
              <a
                key={item}
                href={item === "Home" ? "/" : `#${item.toLowerCase().replace(/ /g, "-")}`}
                className="text-sm font-bold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                {item}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <ThemeToggle />
            <Button
              onClick={openWalletModal}
              className="rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all h-9 sm:h-10 md:h-12 px-3.5 sm:px-6 font-bold text-xs sm:text-sm border-0"
            >
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Connect Wallet
            </Button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
              aria-label="Toggle navigation"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </motion.div>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden mt-2 p-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-zinc-800/60 rounded-3xl shadow-xl space-y-2"
            >
              <div className="grid grid-cols-2 gap-2">
                {[
                  "Home",
                  "About Us",
                  "Features",
                  "How it Works",
                  "Pricing",
                  "Stats",
                  "FAQ",
                  "Contact",
                ].map((item) => (
                  <a
                    key={item}
                    href={item === "Home" ? "/" : `#${item.toLowerCase().replace(/ /g, "-")}`}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {item}
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section (Asymmetric) */}
      <section className="relative z-10 container mx-auto px-4 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Hero Content (Left, 7 columns) */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center space-x-2 bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 px-4 py-2 rounded-full mb-8 shadow-sm backdrop-blur-md"
            >
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs md:text-sm font-bold text-zinc-600 dark:text-zinc-300">
                Soroban Smart Contracts Live on Stellar
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="text-4xl sm:text-6xl lg:text-7xl font-black mb-6 leading-[1.1] tracking-tighter text-zinc-900 dark:text-white"
            >
              Trustless <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent">
                Affiliate
              </span>{" "}
              Stack
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-base sm:text-lg md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 sm:mb-10 max-w-2xl leading-relaxed font-medium"
            >
              The ultimate Web3 affiliate protocol. Harness the speed of Stellar and NIST-level
              encryption to scale your partnerships with zero trust required.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <Button
                onClick={openWalletModal}
                size="lg"
                className="w-full sm:w-auto rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-2xl shadow-indigo-500/25 transition-all transform hover:-translate-y-1 h-14 px-8 text-lg font-bold border-0"
              >
                Launch Protocol
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto rounded-2xl border-slate-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md hover:bg-white dark:hover:bg-zinc-800 text-zinc-900 dark:text-white transition-all h-14 px-8 text-lg font-bold"
              >
                Read Whitepaper
              </Button>
            </motion.div>
          </div>

          {/* Hero Visuals (Right, 5 columns) */}
          <div className="lg:col-span-5 relative flex items-center justify-center min-h-[320px] sm:min-h-[420px] lg:min-h-[580px] mt-6 lg:mt-0 overflow-hidden">
            {/* Glowing Orb Background behind globe */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] sm:w-[350px] sm:h-[350px] lg:w-[400px] lg:h-[400px] bg-gradient-to-br from-sky-400/30 to-indigo-500/20 dark:from-indigo-600/20 dark:to-sky-500/10 blur-[100px] rounded-full z-0 animate-pulse transition-colors duration-700"></div>

            {/* Globe Network Background */}
            <div className="absolute inset-0 z-0 flex items-center justify-center opacity-90 transition-opacity duration-700">
              <svg
                viewBox="0 0 400 400"
                className="w-[280px] h-[280px] sm:w-[380px] sm:h-[380px] lg:w-[500px] lg:h-[500px] animate-[spin_60s_linear_infinite]"
              >
                <circle
                  cx="200"
                  cy="200"
                  r="160"
                  fill="none"
                  className="stroke-slate-300 dark:stroke-indigo-900/50"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <ellipse
                  cx="200"
                  cy="200"
                  rx="160"
                  ry="70"
                  fill="none"
                  className="stroke-slate-300 dark:stroke-indigo-900/50"
                  strokeWidth="0.5"
                />
                <ellipse
                  cx="200"
                  cy="200"
                  rx="70"
                  ry="160"
                  fill="none"
                  className="stroke-slate-300 dark:stroke-indigo-900/50"
                  strokeWidth="0.5"
                />

                {/* Core Nodes & Connections (Symbolizing Africa & Beyond) */}
                <path
                  d="M190 130 L250 170 L220 240 L150 200 Z"
                  fill="none"
                  className="stroke-sky-500 dark:stroke-indigo-400 animate-pulse"
                  strokeWidth="2"
                />
                <circle
                  cx="190"
                  cy="130"
                  r="5"
                  className="fill-indigo-500 dark:fill-sky-400 animate-ping"
                />
                <circle cx="250" cy="170" r="4" className="fill-sky-400 dark:fill-indigo-400" />
                <circle
                  cx="220"
                  cy="240"
                  r="6"
                  className="fill-violet-500 dark:fill-purple-400 animate-pulse"
                />
                <circle cx="150" cy="200" r="4" className="fill-sky-400 dark:fill-indigo-400" />

                {/* Outward Global connections */}
                <path
                  d="M250 170 L320 140 M220 240 L280 290 M150 200 L90 160"
                  fill="none"
                  className="stroke-slate-400 dark:stroke-indigo-700/50"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle cx="320" cy="140" r="3" className="fill-slate-400 dark:fill-indigo-600" />
                <circle cx="280" cy="290" r="3" className="fill-slate-400 dark:fill-indigo-600" />
                <circle cx="90" cy="160" r="3" className="fill-slate-400 dark:fill-indigo-600" />
              </svg>
            </div>

            {/* Abstract Floating UI Elements - Repositioned to bottom right */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, rotate: -5, y: 50 }}
              animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
              transition={{ delay: 0.2, duration: 1, type: "spring", bounce: 0.4 }}
              className="absolute bottom-4 -right-10 w-[350px] bg-white/30 dark:bg-zinc-900/40 backdrop-blur-2xl border border-white/50 dark:border-zinc-700/50 rounded-3xl shadow-2xl overflow-hidden z-20"
            >
              {/* Fake UI Header */}
              <div className="h-10 border-b border-white/20 dark:border-zinc-700/50 flex items-center px-4 space-x-2 bg-white/20 dark:bg-black/20">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
              </div>
              {/* Fake UI Body */}
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="h-3 w-20 bg-white/50 dark:bg-zinc-800/80 rounded-full"></div>
                  <div className="h-5 w-14 bg-indigo-500/20 rounded-full"></div>
                </div>
                <div className="h-20 w-full bg-white/20 dark:bg-black/30 backdrop-blur-lg rounded-xl border border-white/30 dark:border-emerald-500/20 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
                  <div className="absolute inset-0 bg-emerald-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                  <div className="flex items-center text-emerald-600 dark:text-emerald-400 font-mono text-sm font-bold z-10">
                    <Cpu className="w-4 h-4 mr-2 animate-pulse" />
                    Contract Executed
                  </div>
                  <div className="text-[9px] text-zinc-600 dark:text-zinc-400 mt-1 z-10 font-mono">
                    Tx: 8f2b...4e9a
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-1.5 w-full bg-white/50 dark:bg-zinc-800/80 rounded-full"></div>
                  <div className="h-1.5 w-4/5 bg-white/50 dark:bg-zinc-800/80 rounded-full"></div>
                </div>
              </div>
            </motion.div>

            {/* Floating Stats Card - Repositioned to top left */}
            <motion.div
              initial={{ opacity: 0, x: -50, y: -50 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: 0.4, duration: 1, type: "spring", bounce: 0.4 }}
              className="absolute top-10 left-0 w-56 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-700 rounded-3xl p-5 shadow-2xl z-30"
            >
              <div className="flex items-center space-x-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center">
                  <Timer className="w-5 h-5 text-sky-500" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Finality
                  </div>
                  <div className="text-xl font-black text-zinc-900 dark:text-white">&lt; 1 sec</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="relative z-10 container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-6xl mx-auto">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center p-8 rounded-[2rem] bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md shadow-sm border border-slate-200/50 dark:border-zinc-800/50 hover:bg-white dark:hover:bg-zinc-900 transition-colors"
            >
              <div className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white mb-2">
                {stat.value}
              </div>
              <div className="text-xs font-bold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Bento Box Features Section */}
      <section id="features" className="relative z-10 container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter text-zinc-900 dark:text-white">
            Engineered for Scale
          </h2>
          <p className="text-lg text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto font-medium">
            Combining the speed of Stellar with enterprise-grade cryptographic security.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
          {/* Large Box - Stellar Network (Takes 2 cols) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="md:col-span-2 relative overflow-hidden rounded-[2.5rem] bg-zinc-900 dark:bg-zinc-900 border border-zinc-800 p-10 group flex flex-col justify-end"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-sky-500/20 to-transparent blur-[80px] rounded-full group-hover:scale-110 transition-transform duration-700"></div>
            <div className="absolute top-10 right-10 flex space-x-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center">
                <Timer className="w-4 h-4 text-sky-400 mr-2" />
                <span className="text-white text-sm font-bold">Sub-second Finality</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center">
                <Coins className="w-4 h-4 text-emerald-400 mr-2" />
                <span className="text-white text-sm font-bold">Micro-cent Fees</span>
              </div>
            </div>
            <div className="relative z-10 max-w-md">
              <Zap className="w-10 h-10 text-sky-400 mb-6" />
              <h3 className="text-3xl font-black text-white mb-3">Powered by Stellar & Soroban</h3>
              <p className="text-zinc-400 font-medium leading-relaxed">
                Execute hundreds of affiliate payouts instantly. Built natively on Soroban Rust
                smart contracts to leverage Stellar's unmatched throughput and rock-bottom
                transaction costs.
              </p>
            </div>
          </motion.div>

          {/* Medium Box - Encryption */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-10 group flex flex-col justify-end"
          >
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-indigo-500/10 blur-[50px] rounded-full"></div>
            <div className="relative z-10">
              <Shield className="w-10 h-10 text-indigo-500 mb-6" />
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-3">
                NIST Security
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                On-chain data secured via AES-GCM and ECIES public key infrastructure.
              </p>
            </div>
          </motion.div>

          {/* Medium Box - Non Custodial */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="relative overflow-hidden rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-10 group flex flex-col justify-end"
          >
            <div className="relative z-10">
              <Lock className="w-10 h-10 text-violet-500 mb-6" />
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-3">
                Non-Custodial
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">
                Full private key ownership. Only valid key holders can decrypt sales data.
              </p>
            </div>
          </motion.div>

          {/* Large Box - Open Source (Takes 2 cols) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="md:col-span-2 relative overflow-hidden rounded-[2.5rem] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-10 group flex items-center justify-between"
          >
            <div className="relative z-10 max-w-sm">
              <Code2 className="w-10 h-10 text-slate-900 dark:text-white mb-6" />
              <h3 className="text-3xl font-black text-zinc-900 dark:text-white mb-3">
                Fully Open Source
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                Inspect the code, verify the smart contracts, and build your own modules.
                Transparency is at the heart of the protocol.
              </p>
            </div>
            {/* Visual Element */}
            <div className="hidden md:block relative w-64 h-full bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-100 dark:border-zinc-800 overflow-hidden p-4">
              <div className="space-y-3 opacity-50 font-mono text-[10px] text-zinc-400">
                <p>
                  <span className="text-sky-500">pub fn</span> log_sale(env: Env) {"{"}
                </p>
                <p className="pl-4">
                  let <span className="text-indigo-400">auth</span> = verify();
                </p>
                <p className="pl-4">transfer_xlm(amount);</p>
                <p>{"}"}</p>
                <p className="mt-4">
                  <span className="text-emerald-500">// Compiled to Wasm</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section
        id="testimonials"
        className="relative z-10 container mx-auto px-4 py-24 border-t border-slate-200/50 dark:border-zinc-800/50"
      >
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter text-zinc-900 dark:text-white">
            Trusted by the Best
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="h-full border-slate-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md shadow-sm hover:shadow-xl transition-all rounded-[2rem] p-2">
                <CardContent className="p-8">
                  <div className="flex items-center space-x-4 mb-8">
                    <div
                      className={`w-14 h-14 rounded-full p-1 bg-gradient-to-tr ${testimonial.gradient}`}
                    >
                      <img
                        src={testimonial.avatar}
                        alt={testimonial.name}
                        className="w-full h-full rounded-full border-2 border-white dark:border-zinc-900 object-cover"
                      />
                    </div>
                    <div>
                      <div className="font-black text-lg text-zinc-900 dark:text-white">
                        {testimonial.name}
                      </div>
                      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        {testimonial.role}
                      </div>
                    </div>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                    "{testimonial.content}"
                  </p>
                  <div className="flex space-x-1 mt-8">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 container mx-auto px-4 pb-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-[3rem] p-12 md:p-24 text-center relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 left-0 w-full h-full opacity-50 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-sky-400/10 via-indigo-500/5 to-transparent blur-3xl rounded-full" />
          </div>

          <h2 className="relative z-10 text-4xl md:text-7xl font-black text-zinc-900 dark:text-white mb-6 tracking-tighter">
            Scale Securely.
          </h2>
          <p className="relative z-10 text-lg md:text-xl text-zinc-600 dark:text-zinc-400 mb-12 max-w-2xl mx-auto font-medium">
            Join the leading protocol for trustless affiliate marketing on the Stellar network. No
            custodians, no middlemen.
          </p>
          <div className="relative z-10 flex flex-col sm:flex-row justify-center gap-4">
            <Button
              onClick={openWalletModal}
              size="lg"
              className="h-14 px-10 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-lg font-bold transition-transform hover:-translate-y-1 shadow-xl shadow-indigo-500/20 border-0"
            >
              Connect Wallet
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-10 rounded-2xl border-slate-300 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 hover:bg-slate-50 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-lg font-bold"
            >
              Read Documentation
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="bg-white dark:bg-[#09090b] border-t border-slate-200 dark:border-zinc-800 relative z-10">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center mb-6">
                <a href="/" className="flex items-center space-x-3 group">
                  <img src={logo} alt="StormSale Icon" className="h-8 object-contain" />
                  <div className="flex flex-col justify-center">
                    <span className="text-xl font-black text-zinc-900 dark:text-white tracking-tighter leading-none">
                      StormSale
                    </span>
                  </div>
                </a>
              </div>
              <p className="text-zinc-500 text-sm font-medium leading-relaxed max-w-xs">
                Next-generation affiliate protocol built for speed, security, and scale on Stellar.
              </p>
            </div>
            {["Protocol", "Developers", "Company"].map((title, i) => (
              <div key={i}>
                <h3 className="font-bold text-zinc-900 dark:text-white mb-6 uppercase tracking-widest text-xs">
                  {title}
                </h3>
                <ul className="space-y-4 text-sm font-medium text-zinc-500">
                  <li>
                    <a href="#" className="hover:text-indigo-500 transition-colors">
                      Link Item 1
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-indigo-500 transition-colors">
                      Link Item 2
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-indigo-500 transition-colors">
                      Link Item 3
                    </a>
                  </li>
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 dark:border-zinc-800 mt-16 pt-8 flex flex-col md:flex-row justify-between items-center text-xs font-bold text-zinc-400 uppercase tracking-widest">
            <div>© 2026 StormSale Protocol. All rights reserved.</div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2 text-sky-500">
              <Shield className="w-4 h-4" />
              <span>Stellar Mainnet Verified</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
