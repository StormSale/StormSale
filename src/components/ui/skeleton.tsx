import * as React from "react";
import { cn } from "../../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "zinc800" | "shimmer" | "circular" | "rounded" | "text";
}

/**
 * Base Skeleton component with pulse animation and theme-aware background colors.
 * Merges legacy and PR variants so both APIs work together.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: "rounded-md",
      circular: "rounded-full",
      rounded: "rounded-2xl",
      text: "rounded h-4 w-full",
      shimmer: "rounded-md",
      zinc800: "rounded-md bg-zinc-800",
    };

    const baseStyles =
      variant === "zinc800"
        ? "animate-pulse bg-zinc-800"
        : "animate-pulse bg-zinc-200/80 dark:bg-zinc-800 transition-colors duration-200";

    return (
      <div
        ref={ref}
        role="status"
        aria-label="Loading..."
        aria-live="polite"
        className={cn(baseStyles, variantStyles[variant] ?? "rounded-md", className)}
        {...props}
      />
    );
  },
);

Skeleton.displayName = "Skeleton";

/**
 * Text block skeleton rendering multiple lines of varying realistic widths
 * to prevent cumulative layout shift (CLS).
 */
export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lineClassName?: string;
}

export function SkeletonText({ lines = 3, className, lineClassName, ...props }: SkeletonTextProps) {
  const widthPercentages = ["w-full", "w-11/12", "w-4/5", "w-3/4", "w-3/5"];

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", widthPercentages[index % widthPercentages.length], lineClassName)}
        />
      ))}
    </div>
  );
}

/**
 * Circular avatar skeleton for user profiles and wallet icons.
 */
export interface SkeletonAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
}

export function SkeletonAvatar({ size = "md", className, ...props }: SkeletonAvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  return <Skeleton className={cn("rounded-full shrink-0", sizeClasses[size], className)} {...props} />;
}

/**
 * Button-shaped skeleton matching standard button dimensions.
 */
export interface SkeletonButtonProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "default" | "lg" | "icon";
}

export function SkeletonButton({ size = "default", className, ...props }: SkeletonButtonProps) {
  const sizeClasses = {
    sm: "h-8 w-20 rounded-lg",
    default: "h-9 w-28 rounded-xl",
    lg: "h-11 w-36 rounded-2xl",
    icon: "h-8 w-8 rounded-lg",
  };

  return <Skeleton className={cn(sizeClasses[size], className)} {...props} />;
}

/**
 * Metric/KPI card skeleton for dashboard stat cards.
 * Matches exact height and spacing of live overview widgets.
 */
export interface SkeletonMetricProps extends React.HTMLAttributes<HTMLDivElement> {
  hasSubtext?: boolean;
}

export function SkeletonMetric({ hasSubtext = true, className, ...props }: SkeletonMetricProps) {
  return (
    <div
      role="status"
      aria-label="Loading metric..."
      className={cn(
        "p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 space-y-3",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-36" />
      {hasSubtext && (
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-3.5 w-12 rounded" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      )}
    </div>
  );
}

/**
 * Dashboard widget card skeleton matching Card, CardHeader, and CardContent
 * dimensions to eliminate layout shifts when loading charts or complex widgets.
 */
export interface SkeletonWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: string | number;
  showHeaderAction?: boolean;
}

export function SkeletonWidget({
  height = "h-48",
  showHeaderAction = true,
  className,
  ...props
}: SkeletonWidgetProps) {
  return (
    <div
      role="status"
      aria-label="Loading widget..."
      className={cn(
        "rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-sm",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-60" />
        </div>
        {showHeaderAction && <Skeleton className="h-8 w-24 rounded-lg" />}
      </div>
      <div
        className={cn(
          "w-full rounded-lg bg-zinc-100 dark:bg-zinc-800/40 p-4 flex flex-col justify-end space-y-2",
          typeof height === "string" ? height : undefined,
        )}
        style={typeof height === "number" ? { height } : undefined}
      >
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

/**
 * Table skeleton loader matching Table, TableHeader, TableRow, and TableCell.
 * Configurable row and column counts ensure exact dimension parity with live data.
 */
export interface SkeletonTableProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  columns?: number;
  showPagination?: boolean;
  columnWidths?: string[];
  showHeader?: boolean;
}

export const TableSkeleton: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  showPagination = true,
  columnWidths,
  showHeader = true,
  className,
  ...props
}) => {
  const legacyColumnWidths = ["w-1/4", "w-1/3", "w-1/5", "w-1/6", "w-1/4"];
  const effectiveWidths =
    columnWidths ||
    Array.from({ length: columns }, (_, index) => legacyColumnWidths[index % legacyColumnWidths.length]);

  return (
    <div
      role="status"
      aria-label="Loading table..."
      className={cn(
        "w-full rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm",
        className,
      )}
      {...props}
    >
      {showHeader && (
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-4">
          <div className="flex items-center gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`header-${colIndex}`}
                className={cn("h-4", effectiveWidths[colIndex % effectiveWidths.length])}
              />
            ))}
          </div>
        </div>
      )}

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="p-4 flex items-center gap-4 min-h-[56px]">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`cell-${rowIndex}-${colIndex}`}
                className={cn("h-4", effectiveWidths[colIndex % effectiveWidths.length])}
              />
            ))}
          </div>
        ))}
      </div>

      {showPagination && (
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="h-8 w-16 rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
};

export const SkeletonTable = TableSkeleton;

export interface CardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  hasBadge?: boolean;
  hasIcon?: boolean;
}

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

export interface CampaignCardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CampaignCardSkeleton: React.FC<CampaignCardSkeletonProps> = ({ className, ...props }) => {
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-3/4 max-w-[220px]" />
          <Skeleton className="h-3.5 w-1/2 max-w-[140px]" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full shrink-0" />
      </div>

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

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>

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

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
  height = 240,
  barCount = 7,
  className,
  ...props
}) => {
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
