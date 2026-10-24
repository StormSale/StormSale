import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Popover } from "radix-ui";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const badgeVariants = {
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  indigo:
    "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300",
};

export type BadgeVariant = keyof typeof badgeVariants;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: LucideIcon;
  tooltip?: string;
  popoverContent?: React.ReactNode;
}

/**
 * Status and category badge component supporting semantic color variants, icons, tooltips, and interactive popovers.
 */
export function Badge({
  variant = "indigo",
  icon: Icon,
  tooltip,
  popoverContent,
  className,
  children,
  tabIndex,
  onClick,
  onKeyDown,
  ...props
}: BadgeProps) {
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const isInteractive = Boolean(popoverContent);
  const badgeClassName = cn(
    "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
    badgeVariants[variant],
    tooltip &&
      "cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
    isInteractive && "cursor-pointer",
    className,
  );

  const badgeContent = (
    <>
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </>
  );
  const badge = isInteractive ? (
    <button
      type="button"
      tabIndex={tabIndex}
      aria-haspopup="dialog"
      aria-expanded={isPopoverOpen}
      className={badgeClassName}
      onClick={onClick}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      {...props}
    >
      {badgeContent}
    </button>
  ) : (
    <span
      className={badgeClassName}
      tabIndex={tooltip ? (tabIndex ?? 0) : tabIndex}
      onClick={onClick}
      onKeyDown={(event) => {
        onKeyDown?.(event);
      }}
      {...props}
    >
      {badgeContent}
    </span>
  );

  if (!tooltip && !popoverContent) return badge;

  if (isInteractive) {
    return (
      <Popover.Root open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <Popover.Trigger asChild>{badge}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-900 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {popoverContent}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
