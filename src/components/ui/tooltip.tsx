import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = TooltipPrimitive.Content;

interface InfoTooltipProps {
  /** Tooltip body copy. */
  text: React.ReactNode;
  /** Optional visible label rendered before the info icon. */
  label?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * Inline info affordance: an "i" icon with an accessible tooltip bubble.
 */
export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  label,
  side = "top",
  className,
}) => {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 rounded",
              className,
            )}
            tabIndex={0}
          >
            {label}
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="sr-only">More information</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-zinc-700 dark:text-zinc-200 shadow-xl"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
