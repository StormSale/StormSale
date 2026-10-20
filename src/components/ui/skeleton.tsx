import * as React from "react";
import { cn } from "../../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "zinc800" | "shimmer";
}

/**
 * Base Skeleton component with pulsing Zinc-800 animation for dark theme
 * and Zinc-200 for light theme, with optional forced Zinc-800 styling.
 */
export function Skeleton({ className, variant = "default", ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading..."
      className={cn(
        "animate-pulse rounded-md",
        variant === "zinc800" ? "bg-zinc-800" : "bg-zinc-200 dark:bg-zinc-800",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Text block skeleton rendering multiple lines of varying realistic widths
 * to prevent cumulative layout shift (CLS).
 */
export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lineClassName?: string;
}

export function SkeletonText({ lines = 3, className, lineClassName, ...props }: SkeletonTextProps) {
  // Predefined line widths to mimic natural paragraphs
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

  return (
    <Skeleton className={cn("rounded-full shrink-0", sizeClasses[size], className)} {...props} />
  );
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
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  showPagination = true,
  className,
  ...props
}: SkeletonTableProps) {
  const columnWidths = ["w-1/4", "w-1/3", "w-1/5", "w-1/6", "w-1/4"];

  return (
    <div
      className={cn(
        "w-full rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm",
        className,
      )}
      {...props}
    >
      {/* Table Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-4">
        <div className="flex items-center gap-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`header-${colIndex}`}
              className={cn("h-4", columnWidths[colIndex % columnWidths.length])}
            />
          ))}
        </div>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="p-4 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={`cell-${rowIndex}-${colIndex}`}
                className={cn(
                  "h-4",
                  colIndex === 0
                    ? "w-28 font-medium"
                    : columnWidths[colIndex % columnWidths.length],
                )}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Optional Table Pagination Skeleton */}
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
}
