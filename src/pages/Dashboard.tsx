import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { ThemeToggle } from "../components/shared/ThemeToggle";
import { Button } from "../components/ui/button";
import { useWeb3 } from "../hooks/useWeb3";
import {
  Megaphone,
  Users,
  Eye,
  ArrowRight,
  Shield,
  CheckCircle2,
  Wallet,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { userAddress, updateUserRole, isConnected, disconnectWallet } = useWeb3();
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const handleConfirmRole = async (roleId: string) => {
    setIsSigning(true);
    try {
      await updateUserRole(roleId.toUpperCase());
      onNavigate(roleId);
    } catch (error) {
      console.error("Failed to assume role:", error);
    } finally {
      setIsSigning(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const roles = [
    {
      id: "advertiser",
      title: "Advertiser",
      description:
        "Create campaigns, log sales, and manage your affiliate programs securely on-chain.",
      icon: Megaphone,
      colorClasses: {
        border: "border-indigo-500/50",
        shadow: "shadow-indigo-500/10",
        bgHover: "bg-indigo-600 hover:bg-indigo-700",
        shadowBtn: "shadow-indigo-500/25",
      },
      gradient: "from-indigo-500/20 to-violet-500/5",
      iconColor: "text-indigo-500",
      bgClass: "bg-indigo-50 dark:bg-indigo-900/20",
      features: [
        "Deploy Soroban Smart Contracts",
        "Log Encrypted Sales",
        "Manage Affiliate Payouts",
      ],
      consentText:
        "By assuming this role, you agree to deploy smart contracts and authorize XLM transactions for affiliate payouts.",
    },
    {
      id: "affiliate",
      title: "Affiliate",
      description:
        "Join campaigns, track sales, and claim your commissions securely with fast payouts.",
      icon: Users,
      colorClasses: {
        border: "border-emerald-500/50",
        shadow: "shadow-emerald-500/10",
        bgHover: "bg-emerald-600 hover:bg-emerald-700",
        shadowBtn: "shadow-emerald-500/25",
      },
      gradient: "from-emerald-500/20 to-teal-500/5",
      iconColor: "text-emerald-500",
      bgClass: "bg-emerald-50 dark:bg-emerald-900/20",
      features: ["Join Affiliate Programs", "Track Conversion Analytics", "Claim XLM Commissions"],
      consentText:
        "By assuming this role, you agree to receive encrypted tracking IDs and claim authorized XLM payouts.",
    },
    {
      id: "auditor",
      title: "Auditor",
      description:
        "Access encrypted sale data with proper authorization and compliance verification.",
      icon: Eye,
      colorClasses: {
        border: "border-slate-500/50",
        shadow: "shadow-slate-500/10",
        bgHover: "bg-slate-600 hover:bg-slate-700",
        shadowBtn: "shadow-slate-500/25",
      },
      gradient: "from-slate-500/20 to-zinc-500/5",
      iconColor: "text-slate-500",
      bgClass: "bg-slate-100 dark:bg-slate-800/40",
      features: ["Verify On-Chain Data", "Compliance Verification", "Audit Trial Analysis"],
      consentText:
        "By assuming this role, you agree to verify encrypted transactions strictly for compliance purposes.",
    },
  ];

  const getBgClass = () => {
    if (hoveredRole === "advertiser" || expandedRole === "advertiser")
      return "bg-indigo-50/50 dark:bg-indigo-950/20";
    if (hoveredRole === "affiliate" || expandedRole === "affiliate")
      return "bg-emerald-50/50 dark:bg-emerald-950/20";
    if (hoveredRole === "auditor" || expandedRole === "auditor")
      return "bg-slate-100/50 dark:bg-slate-900/30";
    return "bg-slate-50 dark:bg-[#09090b]";
  };

  return (
    <div
      className={`min-h-screen font-sans selection:bg-indigo-500/30 pb-24 transition-colors duration-700 ${getBgClass()}`}
    >
      {/* HUD Header */}
      <div className="border-b border-slate-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Network
              </div>
              <div className="text-sm font-black text-zinc-900 dark:text-white flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse"></span>
                Stellar Mainnet
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <div className="hidden md:flex items-center space-x-2 bg-slate-100 dark:bg-zinc-800 px-4 py-2 rounded-xl">
              <Wallet className="w-4 h-4 text-zinc-500" />
              <span className="text-sm font-bold text-zinc-900 dark:text-white">
                {isConnected && userAddress ? formatAddress(userAddress) : "Not Connected"}
              </span>
            </div>
            {isConnected && (
              <Button
                onClick={() => disconnectWallet()}
                variant="outline"
                size="sm"
                className="rounded-xl font-bold"
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-16">
        {/* Title */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-4 text-zinc-900 dark:text-white">
            Select Your Role
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400 font-medium max-w-xl">
            Choose your primary persona to interact with the protocol. This will configure your
            dashboard and smart contract permissions.
          </p>
        </div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl">
          {roles.map((role, index) => {
            const IconComponent = role.icon;
            const isExpanded = expandedRole === role.id;

            return (
              <motion.div
                key={role.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card
                  className={`group relative h-full flex flex-col overflow-hidden border transition-all duration-500 bg-white dark:bg-zinc-900/80 rounded-[2rem] shadow-sm hover:shadow-2xl cursor-pointer ${isExpanded ? `${role.colorClasses.border} ${role.colorClasses.shadow}` : "border-slate-200 dark:border-zinc-800"}`}
                  onClick={() => !isExpanded && setExpandedRole(role.id)}
                  onMouseEnter={() => setHoveredRole(role.id)}
                  onMouseLeave={() => setHoveredRole(null)}
                >
                  {/* Background Gradient */}
                  <div
                    className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${role.gradient} blur-[60px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none`}
                  ></div>

                  {/* Header */}
                  <CardHeader className="relative z-10 p-8 pb-4">
                    <div className="flex items-center justify-between mb-8">
                      <div
                        className={`w-14 h-14 ${role.bgClass} rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-inner`}
                      >
                        <IconComponent className={`w-7 h-7 ${role.iconColor}`} />
                      </div>

                      {isExpanded ? (
                        <div className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold px-3 py-1.5 rounded-full flex items-center">
                          Active Selection
                        </div>
                      ) : (
                        <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                      )}
                    </div>

                    <CardTitle className="text-3xl font-black text-zinc-900 dark:text-white mb-3">
                      {role.title}
                    </CardTitle>
                    <CardDescription className="text-base text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                      {role.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="relative z-10 px-8 pb-8 flex flex-col flex-1">
                    {/* Features List */}
                    <ul className="space-y-4 mb-8 flex-1 mt-4">
                      {role.features.map((feature, idx) => (
                        <li
                          key={idx}
                          className="flex items-center text-sm font-bold text-zinc-700 dark:text-zinc-300"
                        >
                          <CheckCircle2 className={`w-4 h-4 ${role.iconColor} mr-3 shrink-0`} />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {/* Inline Expansion Area */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-6 border-t border-slate-100 dark:border-zinc-800">
                            <div className="flex items-start space-x-3 p-4 bg-slate-50 dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800 mb-6">
                              <Shield className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 leading-relaxed">
                                {role.consentText}
                              </p>
                            </div>

                            <div className="flex space-x-3">
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRole(null);
                                }}
                                variant="outline"
                                className="flex-1 h-12 rounded-xl font-bold"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConfirmRole(role.id);
                                }}
                                disabled={isSigning}
                                className={`flex-[2] h-12 rounded-xl font-bold text-white shadow-lg ${role.colorClasses.bgHover} ${role.colorClasses.shadowBtn}`}
                              >
                                {isSigning ? "Signing..." : "Sign & Assume Role"}
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
