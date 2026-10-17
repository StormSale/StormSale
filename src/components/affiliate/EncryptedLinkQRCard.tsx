import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Copy, CheckCircle2, Share2 } from 'lucide-react';
import { buildReferralLink } from '../../lib/referralLink';
import { useNotification } from '../../context/NotificationContext';

export interface EncryptedLinkQRCardProps {
  campaignId: string;
  affiliateAddress: string;
}

const EncryptedLinkPreview = ({ link, copied }: { link: string; copied: boolean }) => {
  const copyToClipboard = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className='space-y-2'>
      <input
        readOnly
        value={link}
        className='w-full h-10 px-3 text-sm font-mono border border-slate-200 dark:border-zinc-700 rounded-lg bg-slate-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
      />
      <Button
        variant='ghost'
        size='sm'
        onClick={copyToClipboard}
        className='h-9 px-3'
      >
        {copied ? <CheckCircle2 className='w-4 h-4 text-emerald-500' /> : <Copy className='w-4 h-4' />}
        <span className='ml-2 text-xs'>{copied ? 'Copied!' : 'Copy'}</span>
      </Button>
    </div>
  );
};

export const EncryptedLinkQRCard = ({ campaignId, affiliateAddress }: EncryptedLinkQRCardProps) => {
  const { showNotification } = useNotification();
  const [link, setLink] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const generateLink = async () => {
    setIsGenerating(true);
    try {
      const generated = await buildReferralLink({
        campaignId,
        affiliateAddress,
        origin: window.location.origin,
      });
      setLink(generated);
      setCopied(false);
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Failed to generate link',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  React.useEffect(() => {
    generateLink();
  }, [campaignId, affiliateAddress]);

  return (
    <Card className='border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50'>
      <CardHeader className='border-b border-slate-100 dark:border-zinc-800/50 pb-4'>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='text-lg font-bold text-zinc-900 dark:text-white'>
              <Share2 className='w-5 h-5 inline mr-2' />
              Encrypted Tracking Link
            </CardTitle>
            <CardDescription className='text-zinc-500 dark:text-zinc-400'>
              Share this secure link to track referrals and earnings.
            </CardDescription>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={generateLink}
            disabled={isGenerating || !link}
            className='h-10 px-4'
          >
            <Share2 className='w-4 h-4 mr-2' />
            {isGenerating ? 'Generating...' : 'Regenerate'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {link && <EncryptedLinkPreview link={link} copied={copied} />}

        <div className='space-y-3'>
          <div className='bg-slate-50 dark:bg-zinc-800/50 rounded-xl p-4'>
            {link ? (
              <>
                <div className='mb-2 flex items-center gap-2'>
                  <span className='text-xs font-medium text-zinc-500 dark:text-zinc-400'>QR Code</span>
                  <span className='text-[10px] text-zinc-400 dark:text-zinc-500'>scan to verify</span>
                </div>
                <div className='flex justify-center py-4'>
                  <div className='w-48 h-48'>
                    <QRCodeSVG
                      value={link}
                      size={192}
                      level='H'
                      bgColor='#ffffff'
                      fgColor='#1e293b'
                      includeMargin={true}
                      className='w-full h-full'
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className='flex items-center justify-center h-48 text-sm text-zinc-400 dark:text-zinc-500'>
                No link available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
