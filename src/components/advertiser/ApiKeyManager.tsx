import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { AVAILABLE_SCOPES, createApiKey, listApiKeys, revokeApiKey } from "../../lib/apiKeyManager";
import type { ApiKeyScope, EnterpriseApiKey } from "../../types/apiKey";
import {
  Key,
  Plus,
  Shield,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  Trash2,
  X,
  Clock,
  CheckCircle2,
} from "lucide-react";

interface ApiKeyManagerProps {
  walletAddress?: string;
}

const DEFAULT_TEST_WALLET = "GENTERPRISEB2BTESTWALLETADDRESS";

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({
  walletAddress = DEFAULT_TEST_WALLET,
}) => {
  const [keys, setKeys] = useState<EnterpriseApiKey[]>(() => listApiKeys(walletAddress));
  const [prevWallet, setPrevWallet] = useState(walletAddress);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (walletAddress !== prevWallet) {
    setPrevWallet(walletAddress);
    setKeys(listApiKeys(walletAddress));
  }

  // Form states
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>(["campaigns:read"]);
  const [formError, setFormError] = useState("");

  // One-time secret modal state
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [newKeyCreated, setNewKeyCreated] = useState<EnterpriseApiKey | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Revocation dialog state
  const [revokingKey, setRevokingKey] = useState<EnterpriseApiKey | null>(null);
  const [revokeInput, setRevokeInput] = useState("");
  const [revokeError, setRevokeError] = useState("");

  const refreshKeys = () => {
    setKeys(listApiKeys(walletAddress));
  };

  // Handle scope toggling
  const toggleScope = (scope: ApiKeyScope) => {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const selectAllScopes = () => {
    setSelectedScopes(AVAILABLE_SCOPES.map((s) => s.id));
  };

  const clearAllScopes = () => {
    setSelectedScopes([]);
  };

  // Handle Key Creation
  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!keyName.trim()) {
      setFormError("API key name is required");
      return;
    }
    if (selectedScopes.length === 0) {
      setFormError("Please select at least one permission scope");
      return;
    }

    try {
      const result = createApiKey(walletAddress, {
        name: keyName.trim(),
        scopes: selectedScopes,
      });

      // Show one-time secret modal
      setRevealedSecret(result.secretKey);
      setNewKeyCreated(result.apiKey);

      // Reset form
      setKeyName("");
      setSelectedScopes(["campaigns:read"]);
      setIsCreateOpen(false);
      refreshKeys();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const handleCopySecret = async () => {
    if (revealedSecret) {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(revealedSecret);
        }
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      } catch {
        // Fallback
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      }
    }
  };

  const handleCloseSecretModal = () => {
    // Purge plaintext secret immediately from state
    setRevealedSecret(null);
    setNewKeyCreated(null);
    setCopiedSecret(false);
  };

  // Handle Key Revocation
  const handleOpenRevoke = (key: EnterpriseApiKey) => {
    setRevokingKey(key);
    setRevokeInput("");
    setRevokeError("");
  };

  const handleConfirmRevoke = () => {
    if (!revokingKey) return;
    try {
      revokeApiKey(walletAddress, revokingKey.id, revokeInput);
      setRevokingKey(null);
      setRevokeInput("");
      setRevokeError("");
      refreshKeys();
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke API key");
    }
  };

  return (
    <div className="space-y-8 pb-16" data-testid="b2b-api-key-manager">
      {/* Header & Overview Card */}
      <div className="relative overflow-hidden bg-zinc-900 rounded-[2.5rem] p-8 md:p-10 border border-zinc-800 shadow-2xl">
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-3">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Enterprise Scoped Access
              </span>
              <span className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-xs font-bold uppercase tracking-wider">
                B2B Developer Suite
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
              Enterprise API Keys
            </h1>
            <p className="text-zinc-400 font-medium text-base max-w-2xl">
              Provision granular, cryptographically scoped API keys for programmatic campaign
              orchestration, real-time attribution sync, and escrow balance audits.
            </p>
          </div>

          <Button
            onClick={() => {
              setIsCreateOpen(true);
              setFormError("");
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-6 h-12 text-sm font-bold shadow-lg shadow-indigo-500/25 flex items-center gap-2 shrink-0 transition-all"
            data-testid="open-create-key-btn"
          >
            <Plus className="w-4 h-4" />
            <span>Generate New API Key</span>
          </Button>
        </div>
      </div>

      {/* API Keys Table Card */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white/90 dark:bg-zinc-900/80 overflow-hidden">
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-500" />
              <span>Active Enterprise API Keys ({keys.length})</span>
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Live developer credentials, attached permission scopes, and lifecycle status
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {keys.length === 0 ? (
            <div
              className="p-12 text-center text-zinc-500 dark:text-zinc-400 text-sm"
              data-testid="empty-keys-message"
            >
              <Lock className="w-10 h-10 mx-auto text-zinc-400 mb-3 opacity-60" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                No API keys provisioned yet
              </p>
              <p className="text-xs mt-1">
                Generate your first enterprise API key to begin programmatic automation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" data-testid="api-keys-table">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-zinc-800/60 bg-slate-50/50 dark:bg-zinc-950/40 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th className="py-4 px-6">Key Name</th>
                    <th className="py-4 px-6">Masked Key Identifier</th>
                    <th className="py-4 px-6">Permission Scopes</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Created Date</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 text-xs">
                  {keys.map((k) => (
                    <tr
                      key={k.id}
                      className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                      data-testid={`api-key-row-${k.id}`}
                    >
                      <td
                        className="py-4 px-6 font-bold text-zinc-900 dark:text-white"
                        data-testid={`key-name-${k.id}`}
                      >
                        {k.name}
                      </td>
                      <td className="py-4 px-6 font-mono text-zinc-600 dark:text-zinc-300 text-xs">
                        <span
                          className="bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md font-mono border border-slate-200 dark:border-zinc-700"
                          data-testid={`masked-key-${k.id}`}
                        >
                          {k.maskedKey}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1.5" data-testid={`key-scopes-${k.id}`}>
                          {k.scopes.map((s) => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                              data-testid={`scope-badge-${s}`}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6" data-testid={`key-status-${k.id}`}>
                        {k.status === "active" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            <Clock className="w-3 h-3 text-rose-500" />
                            REVOKED
                          </span>
                        )}
                      </td>
                      <td
                        className="py-4 px-6 text-zinc-500 dark:text-zinc-400 font-mono text-[11px]"
                        data-testid={`key-created-${k.id}`}
                      >
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {k.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenRevoke(k)}
                            className="h-8 px-3 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold"
                            data-testid={`revoke-key-btn-${k.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Revoke
                          </Button>
                        ) : (
                          <span className="text-zinc-400 text-xs italic">Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: Create API Key */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-key-modal-title"
          data-testid="create-key-modal"
        >
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="create-key-modal-title"
                    className="text-lg font-bold text-zinc-900 dark:text-white"
                  >
                    Create Enterprise API Key
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Define name and restrict authorization scopes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-5">
              {formError && (
                <div
                  className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2"
                  role="alert"
                  data-testid="create-key-error"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name input */}
              <div className="space-y-2">
                <label
                  htmlFor="api-key-name-input"
                  className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                >
                  Key Name / Description
                </label>
                <Input
                  id="api-key-name-input"
                  placeholder="e.g. Production Campaign Deployer"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="h-11 rounded-xl"
                  data-testid="api-key-name-input"
                />
              </div>

              {/* Scope checkboxes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Permission Scopes
                  </span>
                  <div className="space-x-2 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllScopes}
                      className="text-indigo-600 hover:underline font-semibold"
                      data-testid="select-all-scopes-btn"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllScopes}
                      className="text-zinc-500 hover:underline font-semibold"
                      data-testid="clear-all-scopes-btn"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div
                  className="space-y-2.5 max-h-56 overflow-y-auto pr-1"
                  data-testid="scope-checkboxes-container"
                >
                  {AVAILABLE_SCOPES.map((scope) => {
                    const isChecked = selectedScopes.includes(scope.id);
                    return (
                      <label
                        key={scope.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked
                            ? "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-800"
                            : "bg-slate-50/50 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        }`}
                        data-testid={`scope-label-${scope.id}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleScope(scope.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          data-testid={`scope-checkbox-${scope.id}`}
                        />
                        <div className="space-y-0.5">
                          <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 block">
                            {scope.label}
                          </span>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block leading-tight">
                            {scope.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl h-10 px-4 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-10 px-5 text-xs font-bold"
                  data-testid="create-key-submit-btn"
                >
                  Generate Key
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: One-Time Secret Key Reveal (AC 2) */}
      {revealedSecret && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="secret-modal-title"
          data-testid="secret-reveal-modal"
        >
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="secret-modal-title"
                  className="text-lg font-bold text-zinc-900 dark:text-white"
                >
                  Save Your Secret API Key
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {newKeyCreated?.name} ({newKeyCreated?.maskedKey})
                </p>
              </div>
            </div>

            {/* Clear Warning Banner */}
            <div
              className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3"
              role="alert"
              data-testid="secret-warning-banner"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-amber-800 dark:text-amber-300 block">
                  Important Security Warning:
                </span>
                <span className="text-amber-700 dark:text-amber-400 leading-relaxed block">
                  Please copy and safely store your secret key now. For your security, this key will{" "}
                  <strong>never be shown again</strong>. If you lose this key, you will need to
                  revoke it and create a new one.
                </span>
              </div>
            </div>

            {/* Secret Key Input & Copy Action */}
            <div className="space-y-2">
              <label
                htmlFor="full-secret-key-input"
                className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
              >
                Secret API Key
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="full-secret-key-input"
                  readOnly
                  value={revealedSecret}
                  className="font-mono text-xs bg-slate-50 dark:bg-zinc-950 h-11 rounded-xl select-all"
                  data-testid="full-secret-key-display"
                />
                <Button
                  type="button"
                  onClick={handleCopySecret}
                  className={`h-11 px-4 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all ${
                    copiedSecret
                      ? "bg-emerald-600 text-white"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  }`}
                  data-testid="copy-secret-key-btn"
                >
                  {copiedSecret ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-zinc-800">
              <Button
                type="button"
                onClick={handleCloseSecretModal}
                className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl h-10 px-6 text-xs font-bold"
                data-testid="close-secret-modal-btn"
              >
                I have saved my secret key
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Revocation Confirmation Dialog (AC 4) */}
      {revokingKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-dialog-title"
          data-testid="revoke-confirmation-dialog"
        >
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="revoke-dialog-title"
                  className="text-lg font-bold text-zinc-900 dark:text-white"
                >
                  Revoke API Key
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Permanent credential deactivation
                </p>
              </div>
            </div>

            <div
              className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2 text-xs"
              data-testid="revoke-warning-box"
            >
              <p className="font-bold text-rose-800 dark:text-rose-300">
                Warning: This action cannot be reversed!
              </p>
              <p className="text-rose-700 dark:text-rose-400 leading-relaxed">
                Any scripts, CI pipelines, or microservices authenticating with this key will
                immediately be blocked from executing requests.
              </p>
            </div>

            {revokeError && (
              <div
                className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs"
                data-testid="revoke-error-message"
              >
                {revokeError}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="revoke-confirm-input"
                className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block"
              >
                To confirm revocation, please type{" "}
                <span className="font-mono font-bold text-zinc-900 dark:text-white select-all">
                  {revokingKey.name}
                </span>{" "}
                below:
              </label>
              <Input
                id="revoke-confirm-input"
                placeholder={revokingKey.name}
                value={revokeInput}
                onChange={(e) => setRevokeInput(e.target.value)}
                className="h-11 rounded-xl font-mono text-xs"
                data-testid="revoke-confirm-input"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRevokingKey(null)}
                className="rounded-xl h-10 px-4 text-xs font-semibold"
                data-testid="cancel-revoke-btn"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={revokeInput.trim() !== revokingKey.name.trim()}
                className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 disabled:hover:bg-rose-600 rounded-xl h-10 px-5 text-xs font-bold"
                data-testid="confirm-revoke-btn"
              >
                Revoke Key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
