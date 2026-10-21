import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { CopyButton } from "../ui/copy-button";
import { useOrganization } from "../../hooks/useOrganization";
import { ROLE_DEFINITIONS, isValidStellarAddress } from "../../lib/teamPermissions";
import type { OrganizationRole } from "../../types/organization";
import {
  Users,
  Shield,
  ShieldCheck,
  UserPlus,
  KeyRound,
  CheckCircle2,
  Clock,
  Trash2,
  Lock,
  Layers,
  AlertTriangle,
  ChevronDown,
  Info,
} from "lucide-react";
import { formatStellarAddress } from "../../lib/stellar";

export const OrganizationManagement: React.FC = () => {
  const {
    organization,
    members,
    currentRole,
    hasCapability,
    addTeamMember,
    updateMemberRole,
    removeTeamMember,
    switchActiveRole,
    verifyCurrentMemberSignature,
    isSigningChallenge,
  } = useOrganization();

  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedRole, setSelectedRole] = useState<OrganizationRole>("EDITOR");
  const [addressError, setAddressError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = hasCapability("team:manage");

  const handleAddressChange = (val: string) => {
    setNewWalletAddress(val);
    if (val.trim() && !isValidStellarAddress(val.trim())) {
      setAddressError("Must be a valid 56-character Stellar public key starting with G");
    } else {
      setAddressError("");
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!newWalletAddress.trim()) {
      setAddressError("Stellar wallet address is required");
      return;
    }
    if (!isValidStellarAddress(newWalletAddress.trim())) {
      setAddressError("Invalid Stellar address format (expected G...)");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await addTeamMember(newWalletAddress.trim(), newName.trim(), selectedRole);
      if (res.success) {
        setNewWalletAddress("");
        setNewName("");
        setSelectedRole("EDITOR");
        setAddressError("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stats calculation
  const adminCount = members.filter((m) => m.role === "ADMIN").length;
  const editorCount = members.filter(
    (m) => m.role === "EDITOR" || m.role === "MARKETING_MANAGER",
  ).length;
  const financeCount = members.filter((m) => m.role === "FINANCE").length;
  const viewerCount = members.filter((m) => m.role === "VIEWER").length;
  const verifiedCount = members.filter((m) => m.authSignatureStatus === "verified").length;

  return (
    <div className="space-y-8 pb-16" data-testid="organization-management">
      {/* 1. Command Center Header */}
      <div className="relative overflow-hidden bg-zinc-900 dark:bg-zinc-900 rounded-[2.5rem] p-8 md:p-10 border border-zinc-800 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/30 via-indigo-600/5 to-transparent blur-3xl rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                Stellar SEP-0010 Signature Auth
              </span>
              <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider">
                Multi-User RBAC Active
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
              Team Permissions & Organization
            </h1>
            <p className="text-zinc-400 font-medium text-base max-w-2xl">
              Authorize team members using individual Stellar wallet signatures without sharing
              private keys. Capability checks enforce access across campaign editing, sale logging,
              and refunds.
            </p>
          </div>

          <Button
            onClick={() => verifyCurrentMemberSignature()}
            disabled={isSigningChallenge}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-6 h-12 text-sm font-bold shadow-lg shadow-indigo-500/25 flex items-center gap-2 shrink-0 transition-all"
          >
            <KeyRound className="w-4 h-4" />
            <span>{isSigningChallenge ? "Signing Challenge..." : "Sign Wallet Auth"}</span>
          </Button>
        </div>
      </div>

      {/* 2. Interactive Role Perspective Testing Toolbar */}
      <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Active Role Perspective:
              </span>
              <span
                className={`text-xs font-black px-2.5 py-0.5 rounded-full border uppercase ${ROLE_DEFINITIONS[currentRole].badgeClass}`}
                data-testid="current-role-badge"
              >
                {currentRole}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ROLE_DEFINITIONS[currentRole].description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500 mr-1">Switch View:</span>
          {(["ADMIN", "EDITOR", "MARKETING_MANAGER", "FINANCE", "VIEWER"] as const).map(
            (roleOption) => (
              <Button
                key={roleOption}
                size="sm"
                variant={currentRole === roleOption ? "default" : "outline"}
                onClick={() => switchActiveRole(roleOption)}
                className={`h-8 rounded-xl text-xs font-bold px-3 transition-all ${
                  currentRole === roleOption
                    ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                }`}
                data-testid={`switch-role-${roleOption.toLowerCase()}`}
              >
                {ROLE_DEFINITIONS[roleOption].label}
              </Button>
            ),
          )}
        </div>
      </div>

      {/* 3. Role Lockdown Alert Banner (When non-admin is active) */}
      {!isAdmin && (
        <div
          className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3"
          data-testid="non-admin-warning-banner"
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold text-amber-800 dark:text-amber-300">
              Restricted Management Mode:{" "}
            </span>
            <span className="text-amber-700 dark:text-amber-400">
              You are currently viewing the organization as <strong>{currentRole}</strong>. Team
              member addition, role mutation, and member removal are locked for non-Admin roles.
              Switch back to Admin view above to test mutating team configuration.
            </span>
          </div>
        </div>
      )}

      {/* 4. Stats Overview Bento */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Members",
            value: members.length,
            icon: Users,
            color: "text-indigo-600 dark:text-indigo-400",
            bg: "bg-indigo-50 dark:bg-indigo-500/10",
          },
          {
            label: "Admins",
            value: adminCount,
            icon: ShieldCheck,
            color: "text-purple-600 dark:text-purple-400",
            bg: "bg-purple-50 dark:bg-purple-500/10",
          },
          {
            label: "Marketing & Editors",
            value: editorCount,
            icon: Layers,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-emerald-500/10",
          },
          {
            label: "Finance & Viewers",
            value: financeCount + viewerCount,
            icon: KeyRound,
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-amber-500/10",
          },
        ].map((s, idx) => {
          const Icon = s.icon;
          return (
            <Card
              key={idx}
              className="bg-white/80 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm"
            >
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {s.label}
                  </p>
                  <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                    {s.value}
                  </p>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700 ${s.bg} ${s.color}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 5. Add Authorized Team Wallet Card */}
      <Card
        className={`border rounded-3xl transition-all shadow-sm ${
          isAdmin
            ? "border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80"
            : "border-slate-200 dark:border-zinc-800/60 bg-slate-50/70 dark:bg-zinc-900/40 opacity-75"
        }`}
        data-testid="add-member-card"
      >
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                  Add Authorized Team Wallet
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Assign granular capabilities to a team member's personal Stellar wallet
                </CardDescription>
              </div>
            </div>

            {!isAdmin && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                <Lock className="w-3.5 h-3.5" />
                Admin Action Only
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-6 md:p-8">
          <form onSubmit={handleAddMember} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Wallet Address Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Stellar Wallet Address (Public Key)</span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Starts with G (56 chars)
                  </span>
                </label>
                <Input
                  disabled={!isAdmin}
                  value={newWalletAddress}
                  onChange={(e) => handleAddressChange(e.target.value)}
                  placeholder="e.g. GBBD47IF6LWK7P7MDEV6GL4C5S4UON3PFFVHG4Z377V5GLR7BGBFLA5"
                  className={`h-12 rounded-xl font-mono text-xs ${
                    addressError
                      ? "border-rose-500 focus:ring-rose-500"
                      : "border-slate-200 dark:border-zinc-800"
                  }`}
                  data-testid="input-wallet-address"
                />
                {addressError && (
                  <p className="text-xs text-rose-500 font-semibold">{addressError}</p>
                )}
              </div>

              {/* Member Name */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Member Name / Department
                </label>
                <Input
                  disabled={!isAdmin}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sarah Connor (Affiliate Growth Lead)"
                  className="h-12 rounded-xl text-xs border-slate-200 dark:border-zinc-800"
                  data-testid="input-member-name"
                />
              </div>
            </div>

            {/* Role Selection Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>Assign Role Permissions</span>
                <span className="text-[10px] text-zinc-400">Controls dashboard capabilities</span>
              </label>

              <div className="relative">
                <select
                  disabled={!isAdmin}
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as OrganizationRole)}
                  className="w-full h-12 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 text-xs font-bold text-zinc-900 dark:text-white appearance-none cursor-pointer pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="role-dropdown-select"
                >
                  <option value="ADMIN">
                    Admin (Full Control, Team Management, Refunds, Campaigns)
                  </option>
                  <option value="EDITOR">Editor (Campaign Editing, Sale Logging, Analytics)</option>
                  <option value="MARKETING_MANAGER">
                    Marketing Manager (Campaigns, Branding, Sale Logging)
                  </option>
                  <option value="FINANCE">
                    Finance (Escrow Refunds, Refill Thresholds, Financials)
                  </option>
                  <option value="VIEWER">Viewer (Read-Only Metrics, Audits, No Mutations)</option>
                </select>
                <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Role Capabilities Preview Box */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  Granted Capabilities for {ROLE_DEFINITIONS[selectedRole].label}:
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROLE_DEFINITIONS[selectedRole].capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    ✓ {cap}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!isAdmin || isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl h-11 px-8 text-sm shadow-md transition-all disabled:opacity-50"
                data-testid="btn-add-member"
              >
                {isSubmitting ? "Authorizing..." : "Add Team Member"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 6. Authorized Team Members Roster */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white/90 dark:bg-zinc-900/80 overflow-hidden">
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <span>Authorized Team Roster ({members.length})</span>
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Active members, assigned roles, and individual Stellar wallet verification status
            </CardDescription>
          </div>

          <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {verifiedCount} of {members.length} Cryptographically Verified
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="team-members-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800/60 bg-slate-50/50 dark:bg-zinc-950/40 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-4 px-6">Member & Name</th>
                  <th className="py-4 px-6">Stellar Wallet Address</th>
                  <th className="py-4 px-6">Assigned Role</th>
                  <th className="py-4 px-6">Signature Verification</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 text-xs">
                {members.map((member) => {
                  const roleDef = ROLE_DEFINITIONS[member.role] || ROLE_DEFINITIONS.VIEWER;
                  const isOwner =
                    member.walletAddress.toUpperCase() === organization.ownerAddress.toUpperCase();
                  const isVerified = member.authSignatureStatus === "verified";

                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                      data-testid={`member-row-${member.id}`}
                    >
                      {/* Name & Badge */}
                      <td className="py-4 px-6">
                        <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                          <span>{member.name}</span>
                          {isOwner && (
                            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              Owner
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          Added {new Date(member.addedAt).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Stellar Address */}
                      <td className="py-4 px-6 font-mono text-zinc-600 dark:text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span title={member.walletAddress}>
                            {formatStellarAddress(member.walletAddress)}
                          </span>
                          <CopyButton text={member.walletAddress} label="Copy address" />
                        </div>
                      </td>

                      {/* Role Dropdown */}
                      <td className="py-4 px-6">
                        {isAdmin ? (
                          <div className="relative inline-block w-40">
                            <select
                              value={member.role}
                              onChange={(e) =>
                                updateMemberRole(member.id, e.target.value as OrganizationRole)
                              }
                              className="w-full text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white appearance-none cursor-pointer pr-8 focus:ring-1 focus:ring-indigo-500"
                              data-testid={`role-select-${member.id}`}
                            >
                              <option value="ADMIN">Admin</option>
                              <option value="EDITOR">Editor</option>
                              <option value="MARKETING_MANAGER">Marketing Manager</option>
                              <option value="FINANCE">Finance</option>
                              <option value="VIEWER">Viewer</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleDef.badgeClass}`}
                          >
                            {roleDef.label}
                          </span>
                        )}
                      </td>

                      {/* Signature Status */}
                      <td className="py-4 px-6">
                        {isVerified ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3 text-amber-500" />
                            Pending Sign
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right space-x-2">
                        {!isVerified && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => verifyCurrentMemberSignature()}
                            disabled={isSigningChallenge}
                            className="h-8 rounded-lg text-xs font-semibold border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                            data-testid={`btn-sign-challenge-${member.id}`}
                          >
                            Sign Challenge
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isAdmin || isOwner}
                          onClick={() => removeTeamMember(member.id)}
                          className="h-8 w-8 p-0 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 disabled:opacity-30 disabled:hover:text-zinc-400"
                          title={isOwner ? "Owner cannot be removed" : "Revoke membership"}
                          data-testid={`btn-remove-${member.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 7. Granular Role Capabilities Reference Guide */}
      <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/50 dark:bg-zinc-900/40 backdrop-blur-md">
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60">
          <CardTitle className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" />
            <span>Capability Matrix & Access Boundaries</span>
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Enforced action limits mapped to Stellar wallet identities across the protocol
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(["ADMIN", "EDITOR", "FINANCE", "VIEWER"] as const).map((r) => {
              const def = ROLE_DEFINITIONS[r];
              return (
                <div
                  key={r}
                  className="p-4 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-extrabold text-sm text-zinc-900 dark:text-white">
                        {def.label}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${def.badgeClass}`}
                      >
                        {def.capabilities.length} Cap.
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
                      {def.description}
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-zinc-800/60 text-[10px] font-mono">
                    {[
                      { cap: "campaign:create", name: "Create Campaigns" },
                      { cap: "sale:log", name: "Log Encrypted Sales" },
                      { cap: "escrow:refund", name: "Refund Escrow" },
                      { cap: "team:manage", name: "Manage Team" },
                    ].map((item) => {
                      const allowed = def.capabilities.includes(item.cap as any);
                      return (
                        <div
                          key={item.cap}
                          className={`flex items-center justify-between ${
                            allowed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400 opacity-60"
                          }`}
                        >
                          <span>{item.name}</span>
                          <span>{allowed ? "✓" : "✗"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
