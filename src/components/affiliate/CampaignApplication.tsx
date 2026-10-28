import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  MAX_CHANNELS,
  MAX_MESSAGE_LENGTH,
  buildTrackingLink,
  getAffiliateAccess,
  getApplication,
  normalizeCampaignId,
  submitApplication,
  type AffiliateAccess,
  type AffiliateApplication,
} from "../../lib/campaignAccess";
import { Check, Clock, Copy, Link2, Lock, Plus, Send, Trash2, XCircle } from "lucide-react";

/**
 * Apply to a private campaign and, once cleared, generate a tracking link.
 * Public campaigns skip straight to the link.
 */
export const CampaignApplication = () => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();
  const [campaignInput, setCampaignInput] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [channels, setChannels] = useState<string[]>([""]);
  const [message, setMessage] = useState("");
  const [trackingLink, setTrackingLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Bumped whenever the access data changes, including when the advertiser
  // decides in another tab; status is derived from storage during render.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("stormsale:campaign-access", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("stormsale:campaign-access", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const { access, application } = useMemo((): {
    access: AffiliateAccess | null;
    application: AffiliateApplication | null;
  } => {
    if (!campaignId || !userAddress) return { access: null, application: null };
    return {
      access: getAffiliateAccess(campaignId, userAddress),
      application: getApplication(campaignId, userAddress),
    };
    // `version` is the change signal: it is read so the memo recomputes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, userAddress, version]);

  // A tracking link names the wallet it was generated for (`ref=`). After an
  // account switch it would credit the previous wallet, so it — and any
  // half-filled application — must not survive the switch. Reset while
  // rendering, when the address changes (React's pattern for adjusting state
  // to a prop change; an effect would render the stale link once first).
  const [linkOwner, setLinkOwner] = useState(userAddress);
  if (linkOwner !== userAddress) {
    setLinkOwner(userAddress);
    setTrackingLink(null);
    setCopied(false);
    setChannels([""]);
    setMessage("");
  }

  // Likewise when access is withdrawn while the page is open (the advertiser
  // reverses an approval): the link is no longer one this affiliate may use,
  // so it is only shown while access still allows it.
  const visibleLink = access?.allowed ? trackingLink : null;

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const lookUp = (e: React.FormEvent) => {
    e.preventDefault();
    setTrackingLink(null);
    try {
      setCampaignId(normalizeCampaignId(campaignInput));
    } catch (err) {
      setCampaignId(null);
      showNotification({ type: "error", title: "Invalid Campaign ID", message: errorMessage(err) });
    }
  };

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId || !userAddress) return;
    try {
      submitApplication({ campaignId, affiliate: userAddress, channels, message });
      setChannels([""]);
      setMessage("");
      showNotification({
        type: "success",
        title: "Application Submitted",
        message: `The advertiser will review your application for campaign #${campaignId}.`,
      });
    } catch (err) {
      showNotification({ type: "error", title: "Could Not Apply", message: errorMessage(err) });
    }
  };

  const generate = () => {
    if (!campaignId || !userAddress) return;
    try {
      setTrackingLink(buildTrackingLink(campaignId, userAddress));
      setCopied(false);
    } catch (err) {
      setTrackingLink(null);
      showNotification({ type: "error", title: "Link Not Available", message: errorMessage(err) });
    }
  };

  const copy = async () => {
    if (!visibleLink) return;
    try {
      await navigator.clipboard.writeText(visibleLink);
      setCopied(true);
    } catch {
      showNotification({
        type: "warning",
        title: "Copy Failed",
        message: "Select the link and copy it manually.",
      });
    }
  };

  const setChannel = (i: number, value: string) =>
    setChannels((prev) => prev.map((c, j) => (j === i ? value : c)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Apply & Tracking Links
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Private campaigns need the advertiser's approval before you can generate a tracking link.
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl max-w-2xl">
        <CardHeader className="pt-8 px-6 sm:px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Link2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Find a Campaign
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Enter the campaign ID shared by the advertiser
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-6 sm:px-8 pb-8 pt-6 space-y-6">
          {!userAddress ? (
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Connect your wallet to apply or generate tracking links.
            </p>
          ) : (
            <form onSubmit={lookUp} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="apply-campaign-id" className="sr-only">
                  Campaign ID
                </Label>
                <Input
                  id="apply-campaign-id"
                  inputMode="numeric"
                  value={campaignInput}
                  onChange={(e) => setCampaignInput(e.target.value)}
                  placeholder="Campaign ID, e.g. 1042"
                  className="h-12 rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                />
              </div>
              <Button
                type="submit"
                disabled={!campaignInput.trim()}
                className="h-12 rounded-xl font-semibold px-6"
              >
                Check Access
              </Button>
            </form>
          )}

          {campaignId && access && userAddress && (
            <div className="space-y-5">
              {/* Status */}
              {access.allowed && access.visibility === "unknown" ? (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-500/10 border border-slate-200 dark:border-slate-500/20">
                  <Lock className="w-5 h-5 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-200 text-sm">
                      Access setting not available on this device
                    </p>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1">
                      {access.reason} You can still generate a tracking link for campaign #
                      {campaignId}.
                    </p>
                  </div>
                </div>
              ) : access.allowed ? (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                      {access.visibility === "public" ? "Public campaign" : "You're approved"}
                    </p>
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                      You can generate your tracking link for campaign #{campaignId}.
                    </p>
                  </div>
                </div>
              ) : access.status === "pending" ? (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-amber-900 dark:text-amber-300 text-sm">
                      Application under review
                    </p>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-1">
                      Submitted{" "}
                      {application ? new Date(application.submittedAt).toLocaleString() : ""}. Your
                      tracking link unlocks when the advertiser approves you.
                    </p>
                  </div>
                </div>
              ) : access.status === "rejected" ? (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
                  <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-rose-900 dark:text-rose-300 text-sm">
                      Application declined
                    </p>
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-400 mt-1">
                      The advertiser declined your application for this private campaign. You can't
                      generate a link or be credited with sales for it.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20">
                  <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">
                      Private campaign — application required
                    </p>
                    <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mt-1">
                      Tell the advertiser where you'll promote it.
                    </p>
                  </div>
                </div>
              )}

              {/* Application form: private, never applied */}
              {!access.allowed && access.status === "none" && (
                <form onSubmit={apply} className="space-y-5">
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                      Promotional channel links
                    </legend>
                    {channels.map((channel, i) => (
                      <div key={i} className="flex gap-2">
                        <Label htmlFor={`channel-${i}`} className="sr-only">
                          Channel link {i + 1}
                        </Label>
                        <Input
                          id={`channel-${i}`}
                          type="url"
                          required={i === 0}
                          value={channel}
                          onChange={(e) => setChannel(i, e.target.value)}
                          placeholder="https://youtube.com/@yourchannel"
                          className="h-11 rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                        />
                        {channels.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Remove channel link ${i + 1}`}
                            onClick={() => setChannels((prev) => prev.filter((_, j) => j !== i))}
                            className="h-11 w-11 rounded-xl shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {channels.length < MAX_CHANNELS && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setChannels((prev) => [...prev, ""])}
                        className="rounded-xl font-semibold"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add another channel
                      </Button>
                    )}
                  </fieldset>

                  <div className="space-y-2">
                    <Label
                      htmlFor="apply-message"
                      className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider"
                    >
                      Message to the advertiser (optional)
                    </Label>
                    <textarea
                      id="apply-message"
                      value={message}
                      maxLength={MAX_MESSAGE_LENGTH}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      placeholder="Audience size, niche, how you plan to promote…"
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-zinc-400 text-right">
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </p>
                  </div>

                  <Button type="submit" className="w-full h-12 rounded-xl font-bold">
                    <Send className="w-4 h-4 mr-2" />
                    Submit Application
                  </Button>
                </form>
              )}

              {/* Tracking link: cleared affiliates only */}
              {access.allowed && (
                <div className="space-y-3">
                  <Button
                    type="button"
                    onClick={generate}
                    className="w-full h-12 rounded-xl font-bold"
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    Generate Tracking Link
                  </Button>
                  {visibleLink && (
                    <div className="flex gap-2">
                      <Label htmlFor="tracking-link" className="sr-only">
                        Your tracking link
                      </Label>
                      <Input
                        id="tracking-link"
                        readOnly
                        value={visibleLink}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-11 rounded-xl font-mono text-xs bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={copy}
                        aria-label="Copy tracking link"
                        className="h-11 rounded-xl shrink-0 font-semibold"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
