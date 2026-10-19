import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, X } from "lucide-react";
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

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
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
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
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

// -----------------------------------------------------------------------------
// Soroban resource diagnostic profiler
// -----------------------------------------------------------------------------

export interface SorobanResourceConsumption {
  /** Fee in strops (1 XLM = 10^-7 XLM) as reported by the simulation. */
  minResourceFee?: string | number;
  cpuInstructions?: string | number;
  memoryBytes?: string | number;
  /** Ledger entry read bytes (if provided by the simulation). */
  readBytes?: string | number;
  /** Ledger entry write bytes (if provided by the simulation). */
  writeBytes?: string | number;
  /** Optional human-readable label for the invoked contract function. */
  contractFunction?: string;
}

export interface ResourceThresholds {
  cpuInstructions?: number;
  memoryBytes?: number;
  readBytes?: number;
  writeBytes?: number;
  minResourceFee?: number;
}

export interface DialogResourceDiagnosticProps {
  resources?: SorobanResourceConsumption | null;
  /** Result of the `simulateTransaction` RPC call. */
  simulation?: unknown | null;
  /** Whether the dev-mode resource diagnostic is visible. */
  devMode?: boolean;
  /** Override the default thresholds used for warnings. */
  thresholds?: ResourceThresholds;
  /** Controlled open state for the accordion. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const DEFAULT_THRESHOLDS: Required<ResourceThresholds> = {
  cpuInstructions: 100_000_000,
  memoryBytes: 40_000_000,
  readBytes: 200_000,
  writeBytes: 100_000,
  minResourceFee: 5_000_000,
};

function toNumber(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function formatInteger(value: number | undefined): string {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Extracts the resource consumption breakdown from a Soroban RPC `simulateTransaction`
 * response. Supports both the camelCase response shape used by the JS SDK and the
 * snake_case shape returned by the JSON RPC endpoint.
 */
export function extractResourceConsumption(simulation: unknown | null | undefined): SorobanResourceConsumption | null {
  if (!simulation || typeof simulation !== "object") return null;
  const root = simulation as Record<string, unknown>;
  const cost = (root.cost ?? root.cost_result ?? root.costResult ?? {}) as Record<string, unknown>;
  const minResourceFee = root.minResourceFee ?? root.min_resource_fee;
  const cpuInstructions = cost.cpuInstructions ?? cost.cpu_instructions;
  const memoryBytes = cost.memoryBytes ?? cost.memory_bytes;
  const readBytes = cost.readBytes ?? cost.read_bytes;
  const writeBytes = cost.writeBytes ?? cost.write_bytes;

  if (
    minResourceFee === undefined &&
    cpuInstructions === undefined &&
    memoryBytes === undefined &&
    readBytes === undefined &&
    writeBytes === undefined
  ) {
    return null;
  }

  return {
    minResourceFee: minResourceFee as string | number | undefined,
    cpuInstructions: cpuInstructions as string | number | undefined,
    memoryBytes: memoryBytes as string | number | undefined,
    readBytes: readBytes as string | number | undefined,
    writeBytes: writeBytes as string | number | undefined,
  };
}

function useResourceDiagnostics(
  resources: SorobanResourceConsumption | null | undefined,
  simulation: unknown | null | undefined,
  thresholds: ResourceThresholds | undefined,
) {
  return React.useMemo(() => {
    const derived = resources ?? extractResourceConsumption(simulation);
    if (!derived) return null;

    const limits = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) };
    const cpu = toNumber(derived.cpuInstructions);
    const memory = toNumber(derived.memoryBytes);
    const read = toNumber(derived.readBytes);
    const write = toNumber(derived.writeBytes);
    const fee = toNumber(derived.minResourceFee);

    const warnings: string[] = [];
    if (cpu !== undefined && cpu > limits.cpuInstructions) {
      warnings.push(
        `CPU instructions (${formatInteger(cpu)}) exceed the recommended budget of ${formatInteger(limits.cpuInstructions)}.`,
      );
    }
    if (memory !== undefined && memory > limits.memoryBytes) {
      warnings.push(
        `Memory usage (${formatInteger(memory)} bytes) exceeds the recommended budget of ${formatInteger(limits.memoryBytes)} bytes.`,
      );
    }
    if (read !== undefined && read > limits.readBytes) {
      warnings.push(
        `Ledger read bytes (${formatInteger(read)}) exceed the recommended budget of ${formatInteger(limits.readBytes)}.`,
      );
    }
    if (write !== undefined && write > limits.writeBytes) {
      warnings.push(
        `Ledger write bytes (${formatInteger(write)}) exceed the recommended budget of ${formatInteger(limits.writeBytes)}.`,
      );
    }
    if (fee !== undefined && fee > limits.minResourceFee) {
      warnings.push(
        `Minimum resource fee (${formatInteger(fee)} strops) exceeds the recommended budget of ${formatInteger(limits.minResourceFee)} strops.`,
      );
    }

    return {
      resources: derived,
      cpu,
      memory,
      read,
      write,
      fee,
      warnings,
    };
  }, [resources, simulation, thresholds]);
}

export const DialogResourceDiagnostic = ({
  resources,
  simulation,
  devMode = false,
  thresholds,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: DialogResourceDiagnosticProps) => {
  const diagnostics = useResourceDiagnostics(resources, simulation, thresholds);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? Boolean(open) : internalOpen;

  if (!devMode || !diagnostics) return null;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const rows: Array<{ label: string; value: string; testId?: string }> = [
    { label: "Min resource fee", value: `${formatInteger(diagnostics.fee)} strops`, testId: "resource-fee" },
    { label: "CPU instructions", value: formatInteger(diagnostics.cpu), testId: "resource-cpu" },
    { label: "Memory", value: `${formatInteger(diagnostics.memory)} bytes`, testId: "resource-memory" },
  ];
  if (diagnostics.read !== undefined) {
    rows.push({ label: "Ledger read", value: `${formatInteger(diagnostics.read)} bytes`, testId: "resource-read" });
  }
  if (diagnostics.write !== undefined) {
    rows.push({ label: "Ledger write", value: `${formatInteger(diagnostics.write)} bytes`, testId: "resource-write" });
  }

  return (
    <div
      data-testid="resource-diagnostic"
      className={cn("mt-2 rounded-md border bg-muted/40", className)}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls="resource-diagnostic-panel"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          Resource Diagnostic
          {diagnostics.warnings.length > 0 ? (
            <span
              className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-700"
              data-testid="resource-warning-count"
            >
              {diagnostics.warnings.length} warning
              {diagnostics.warnings.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {isOpen ? (
        <div
          id="resource-diagnostic-panel"
          className="space-y-2 border-t px-3 py-2 text-sm"
        >
          <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-mono text-right" data-testid={row.testId}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {diagnostics.warnings.length > 0 ? (
            <ul
              className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700"
              data-testid="resource-warnings"
            >
              {diagnostics.warnings.map((warning) => (
                <li key={warning}>⚠ {warning}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Resource footprint is within the recommended budgets.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
DialogResourceDiagnostic.displayName = "DialogResourceDiagnostic";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
