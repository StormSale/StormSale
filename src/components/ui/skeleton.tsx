import * as React from "react";
import { cn } from "../../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "circular" | "rounded" | "text";
}

/**
 * Base Skeleton component featuring pulsing Zinc-800 animation in dark mode.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: "rounded-md",
      circular: "rounded-full",
      rounded: "rounded-2xl",
      text: "rounded h-4 w-full",
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading..."
        className={cn(
          "animate-pulse bg-slate-200/80 dark:bg-zinc-800 transition-colors duration-200",
          variantStyles[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Skeleton.displayName = "Skeleton";

export interface CardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  hasBadge?: boolean;
  hasIcon?: boolean;
}

/**
 * Dimension-matched skeleton for KPI and Stat metric cards (prevents layout shift).
 */
export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  className,
  hasBadge = true,
  hasIcon = true,
  ...props
}) => {
  return (
    <div
      role="status"
      aria-label="Loading card..."
      className={cn(
        "rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-sm min-h-[148px] flex flex-col justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {hasIcon && <Skeleton className="w-10 h-10 rounded-xl" />}
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        {hasBadge && <Skeleton className="h-6 w-16 rounded-full" />}
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  );
};
CardSkeleton.displayName = "CardSkeleton";

export interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  columns?: number;
  columnWidths?: string[];
  showHeader?: boolean;
}

/**
 * Dimension-matched skeleton loader for tabular data.
 * Exact cell heights and customizable column widths prevent Cumulative Layout Shift (CLS).
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  columns = 4,
  columnWidths,
  showHeader = true,
  className,
  ...props
}) => {
  const effectiveWidths = columnWidths || Array(columns).fill("w-full");

  return (
    <div
      role="status"
      aria-label="Loading table..."
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/40",
        className,
      )}
      {...props}
    >
      {/* Table Header */}
      {showHeader && (
        <div className="flex items-center border-b border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/80 px-6 py-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={`header-col-${colIndex}`}
              className={cn("flex-1 px-2 first:pl-0 last:pr-0", effectiveWidths[colIndex])}
            >
              <Skeleton className="h-4 w-3/4 max-w-[120px]" />
            </div>
          ))}
        </div>
      )}

      {/* Table Rows */}
      <div className="divide-y divide-slate-100 dark:divide-zinc-800/60">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="flex items-center px-6 py-4 min-h-[56px] transition-colors"
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={`cell-${rowIndex}-${colIndex}`}
                className={cn("flex-1 px-2 first:pl-0 last:pr-0", effectiveWidths[colIndex])}
              >
                <Skeleton
                  className={cn(
                    "h-4",
                    colIndex === 0
                      ? "w-4/5 max-w-[180px]"
                      : colIndex === columns - 1
                        ? "w-1/2 max-w-[90px]"
                        : "w-2/3 max-w-[140px]",
                  )}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
TableSkeleton.displayName = "TableSkeleton";

export interface CampaignCardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Dimension-matched skeleton for campaign cards in Advertiser/Affiliate directories.
 */
export const CampaignCardSkeleton: React.FC<CampaignCardSkeletonProps> = ({
  className,
  ...props
}) => {
  return (
    <div
      role="status"
      aria-label="Loading campaign card..."
      className={cn(
        "rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-sm space-y-5 min-h-[260px]",
        className,
      )}
      {...props}
    >
      {/* Top row: Title and Status Badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-3/4 max-w-[220px]" />
          <Skeleton className="h-3.5 w-1/2 max-w-[140px]" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full shrink-0" />
      </div>

      {/* Stats row (3 columns) */}
      <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>

      {/* Escrow Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end space-x-2 pt-1">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
};
CampaignCardSkeleton.displayName = "CampaignCardSkeleton";

export interface ChartSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: number;
  barCount?: number;
}

/**
 * Dimension-matched skeleton for graphical analytics and performance charts.
 */
export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
  height = 240,
  barCount = 7,
  className,
  ...props
}) => {
  // Staggered heights to simulate an active bar chart
  const barHeights = [45, 75, 60, 90, 40, 85, 65, 95, 55, 70, 80, 50];

  return (
    <div
      role="status"
      aria-label="Loading chart..."
      className={cn(
        "rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-sm space-y-6",
        className,
      )}
      {...props}
    >
      {/* Chart Header & Controls */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-48" />
        </div>
        <div className="flex space-x-1.5">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>

      {/* Bar Chart Graphic Area */}
      <div
        className="flex items-end justify-between gap-3 pt-4 border-b border-slate-100 dark:border-zinc-800/80"
        style={{ height: `${height}px` }}
      >
        {Array.from({ length: barCount }).map((_, i) => {
          const heightPercent = barHeights[i % barHeights.length];
          return (
            <div key={`chart-bar-${i}`} className="flex-1 flex flex-col items-center h-full justify-end">
              <Skeleton
                className="w-full max-w-[40px] rounded-t-lg transition-all"
                style={{ height: `${heightPercent}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* X-Axis Labels */}
      <div className="flex justify-between items-center px-1">
        {Array.from({ length: barCount }).map((_, i) => (
          <Skeleton key={`axis-${i}`} className="h-3 w-8" />
        ))}
      </div>
    </div>
  );
};
ChartSkeleton.displayName = "ChartSkeleton";

export interface FormSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  fieldsCount?: number;
}

/**
 * Dimension-matched skeleton for form inputs, text areas, and submit buttons.
 */
export const FormSkeleton: React.FC<FormSkeletonProps> = ({
  fieldsCount = 3,
  className,
  ...props
}) => {
  return (
    <div
      role="status"
      aria-label="Loading form..."
      className={cn(
        "rounded-2xl border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-8 shadow-sm space-y-6",
        className,
      )}
      {...props}
    >
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="space-y-5 pt-2">
        {Array.from({ length: fieldsCount }).map((_, i) => (
          <div key={`field-${i}`} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
      </div>

      <Skeleton className="h-14 w-full rounded-xl mt-4" />
    </div>
  );
};
FormSkeleton.displayName = "FormSkeleton";

export interface SkeletonWrapperProps {
  isLoading: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Convenience wrapper component to toggle between skeleton and content seamlessly.
 */
export const SkeletonWrapper: React.FC<SkeletonWrapperProps> = ({
  isLoading,
  skeleton,
  children,
  className,
}) => {
  if (isLoading) {
    return <div className={className}>{skeleton}</div>;
  }
  return <>{children}</>;
};
SkeletonWrapper.displayName = "SkeletonWrapper";
