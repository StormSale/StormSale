import * as React from "react";
import * as DialogPrimitive from "@rad-ui/react-dialog";
import { X, ChevronDown, AlertTriangle, Cpu, MemoryStick } from "lucide-react";
import { cn } from "../../lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface SorobanResourceReport {
  minResourceFee?: string | number;
  cpuInstructions?: string | number;
  memoryBytes?: string | number;
  readBytes?: string | number;
  writeBytes?: string | number;
  warnings?: string[];
}

const CPU_WARN_THRESHOLD = 100_000_000;
const MEMORY_WARN_THRESHOLD = 40_000_000;

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

function formatInteger(value: string | number | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toLocaleString();
}

function formatFee(value: string | number | undefined): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${n.toLocaleString()} stroops`;
}

function deriveWarnings(report: SorobanResourceReport): string[] {
  if (report.warnings && report.warnings.length > 0) return report.warnings;
  const warnings: string[] = [];
  const cpu = toNumber(report.cpuInstructions);
  const mem = toNumber(report.memoryBytes);
  if (cpu !== null && cpu > CPU_WARN_THRESHOLD) {
    warnings.push(
      `High CPU usage (${cpu.toLocaleString()} instructions). Consider optimizing contract logic.`,
    );
  }
  if (mem !== null && mem > MEMORY_WARN_THRESHOLD) {
    warnings.push(
      `High memory footprint (${mem.toLocaleString()} bytes). Review allocations and buffer sizes.`,
    );
  }
  return warnings;
}

export interface ResourceDiagnosticProps {
  report?: SorobanResourceReport | null;
  defaultOpen?: boolean;
  className?: string;
}

const ResourceDiagnostic = ({ report, defaultOpen = false, className }: ResourceDiagnosticProps) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const warnings = report ? deriveWarnings(report) : [];
  const hasWarnings = warnings.length > 0;

  if (!report) return null;

  return (
    <div className={cn("border rounded-md", className)} data-testid="resource-diagnostic">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
          />
          <span>Resource Diagnostic</span>
        </span>
        {hasWarnings ? (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {warnings.length} warning{warnings.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </button>
      {isOpen ? (
        <div className="border-t px-3 py-2 space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="flex items-center gap-1 text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" />
              CSU Instructions
            </dt>
            <dd className="text-right font-mono">{formatInteger(report.cpuInstructions)}</dd>
            <dt className="flex items-center gap-1 text-muted-foreground">
              <MemoryStick className="h-3.5 w-3.5" />
              Memory Bytes
            </dt>
            <dd className="text-right font-mono">{formatInteger(report.memoryBytes)}</dd>
            <dt className="text-muted-foreground">Ledger Read Bytes</dt>
            <dd className="text-right font-mono">{formatInteger(report.readBytes)}</dd>
            <dt className="text-muted-foreground">Ledger Write Bytes</dt>
            <dd className="text-right font-mono">{formatInteger(report.writeBytes)}</dd>
            <dt className="text-muted-foreground">Min Resource Fee</dt>
            <dd className="text-right font-mono">{formatFee(report.minResourceFee)}</dd>
          </dl>
          {hasWarnings ? (
            <ul className="space-y-1">
              {warnings.map((warning, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-md bg-amber-50/60 px-2 py-1.5 texe-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Resource footprint within expected bounds.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
ResourceDiagnostic.displayName = "ResourceDiagnostic";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ResourceDiagnostic,
};
