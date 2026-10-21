import * as React from "react";
import { useState, useMemo, useCallback } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { cn } from "../../lib/utils";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Skeleton } from "./skeleton";

/* =========================================================================
   1. CORE HTML TABLE PRIMITIVES (Preserved for compatibility)
   ========================================================================= */

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

/* =========================================================================
   2. CUSTOM CELL RENDERERS (Addresses & Transaction Hashes)
   ========================================================================= */

export interface AddressCellProps {
  address: string;
  truncateChars?: number;
  network?: "testnet" | "public";
  showExplorerLink?: boolean;
  showCopy?: boolean;
  className?: string;
  explorerBaseUrl?: string;
}

export const AddressCell: React.FC<AddressCellProps> = ({
  address,
  truncateChars = 4,
  network = "testnet",
  showExplorerLink = true,
  showCopy = true,
  className,
  explorerBaseUrl,
}) => {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return <span className="text-zinc-400 text-xs italic">—</span>;
  }

  const truncated =
    address.length > truncateChars * 2 + 3
      ? `${address.slice(0, truncateChars)}...${address.slice(-truncateChars)}`
      : address;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
      }
    }
  };

  const isContract = StrKey.isValidContract(address);
  const isAccount = StrKey.isValidEd25519PublicKey(address);
  const isMuxed = StrKey.isValidMed25519PublicKey(address);
  const isValidAddress = (isContract || isAccount) && !isMuxed;

  const encodedAddress = encodeURIComponent(address);
  const defaultUrl = isContract
    ? `https://stellar.expert/explorer/${network}/contract/${encodedAddress}`
    : `https://stellar.expert/explorer/${network}/account/${encodedAddress}`;
  const explorerUrl = isValidAddress
    ? explorerBaseUrl
      ? `${explorerBaseUrl}/${encodedAddress}`
      : defaultUrl
    : null;

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 font-mono text-xs", className)}
      title={address}
    >
      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{truncated}</span>

      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
          aria-label="Copy address"
          title="Copy address"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      )}

      {showExplorerLink && explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
          aria-label="View on Stellar Expert"
          title="View on Stellar Expert"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
};

export interface TxHashCellProps {
  hash: string;
  truncateChars?: number;
  network?: "testnet" | "public";
  showExplorerLink?: boolean;
  showCopy?: boolean;
  className?: string;
  explorerBaseUrl?: string;
}

export const TxHashCell: React.FC<TxHashCellProps> = ({
  hash,
  truncateChars = 6,
  network = "testnet",
  showExplorerLink = true,
  showCopy = true,
  className,
  explorerBaseUrl,
}) => {
  const [copied, setCopied] = useState(false);

  if (!hash) {
    return <span className="text-zinc-400 text-xs italic">—</span>;
  }

  const truncated =
    hash.length > truncateChars + 4 ? `${hash.slice(0, truncateChars)}...${hash.slice(-4)}` : hash;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
      }
    }
  };

  const encodedHash = encodeURIComponent(hash);
  const defaultUrl = `https://stellar.expert/explorer/${network}/tx/${encodedHash}`;
  const explorerUrl = explorerBaseUrl ? `${explorerBaseUrl}/${encodedHash}` : defaultUrl;

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 font-mono text-xs", className)}
      title={hash}
    >
      <span className="font-semibold text-indigo-600 dark:text-indigo-400">{truncated}</span>

      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
          aria-label="Copy transaction hash"
          title="Copy transaction hash"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
      )}

      {showExplorerLink && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
          aria-label="View transaction on Stellar Expert"
          title="View transaction on Stellar Expert"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
};

/* =========================================================================
   3. DATA TABLE TYPES & SORTING LOGIC
   ========================================================================= */

export type SortDirection = "asc" | "desc";

export interface ColumnSort {
  id: string;
  desc: boolean;
  priority?: number;
}

export type SortingState = ColumnSort[];

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

export interface HeaderContext<TData> {
  column: ColumnDef<TData>;
  sorting?: ColumnSort;
  isSorted: boolean;
  sortDirection?: SortDirection;
  sortPriority?: number;
  toggleSorting: (multi?: boolean) => void;
}

export interface CellContext<TData> {
  row: TData;
  value: unknown;
  index: number;
}

export interface ColumnDef<TData> {
  id?: string;
  accessorKey?: keyof TData | string;
  header: React.ReactNode | ((context: HeaderContext<TData>) => React.ReactNode);
  cell?: (context: CellContext<TData>) => React.ReactNode;
  enableSorting?: boolean;
  sortingFn?: (a: TData, b: TData, desc: boolean) => number;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  skeleton?: React.ReactNode;
}

/* =========================================================================
   4. ASYNC SKELETON LOADER FOR TABLES
   ========================================================================= */

export interface TableSkeletonProps<TData> {
  columns: ColumnDef<TData>[] | number;
  rowCount?: number;
}

export function TableSkeleton<TData>({ columns, rowCount = 5 }: TableSkeletonProps<TData>) {
  const columnCount = Array.isArray(columns) ? columns.length : columns;
  const colDefs = Array.isArray(columns) ? columns : undefined;

  const widthClasses = ["w-3/4", "w-1/2", "w-4/5", "w-2/3", "w-3/5"];

  return (
    <>
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <TableRow
          key={`skeleton-row-${rowIndex}`}
          className="border-b border-slate-100 dark:border-zinc-800/80"
        >
          {Array.from({ length: columnCount }).map((_, colIndex) => {
            const customSkeleton = colDefs?.[colIndex]?.skeleton;
            const widthClass = widthClasses[(rowIndex + colIndex) % widthClasses.length];

            return (
              <TableCell key={`skeleton-cell-${rowIndex}-${colIndex}`} className="py-4">
                {customSkeleton || <Skeleton className={cn("h-4 rounded", widthClass)} />}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

/* =========================================================================
   5. GENERIC HIGH-PERFORMANCE DATA TABLE COMPONENT
   ========================================================================= */

export interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  getRowId?: (row: TData, index: number) => string;
  isLoading?: boolean;
  skeletonRowCount?: number;
  emptyMessage?: React.ReactNode;
  // Multi-column Sorting
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  defaultSorting?: SortingState;
  manualSorting?: boolean;
  enableMultiSort?: boolean;
  // Pagination
  enablePagination?: boolean;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  defaultPagination?: PaginationState;
  pageSizeOptions?: number[];
  manualPagination?: boolean;
  totalRows?: number;
  pageCount?: number;
  // Search filter
  searchQuery?: string;
  filterFn?: (row: TData, query: string) => boolean;
  // Appearance & Callbacks
  className?: string;
  containerClassName?: string;
  tableClassName?: string;
  onRowClick?: (row: TData, index: number) => void;
}

export function getColumnId<TData>(col: ColumnDef<TData>, index: number): string {
  return (col.id || col.accessorKey || `col-${index}`) as string;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  isLoading = false,
  skeletonRowCount = 5,
  emptyMessage = "No matching records found.",
  // Sorting
  sorting: controlledSorting,
  onSortingChange,
  defaultSorting = [],
  manualSorting = false,
  enableMultiSort = true,
  // Pagination
  enablePagination = true,
  pagination: controlledPagination,
  onPaginationChange,
  defaultPagination = { pageIndex: 0, pageSize: 10 },
  pageSizeOptions = [5, 10, 20, 50, 100],
  manualPagination = false,
  totalRows: controlledTotalRows,
  pageCount: controlledPageCount,
  // Filter
  searchQuery = "",
  filterFn,
  // Appearance
  className,
  containerClassName,
  tableClassName,
  onRowClick,
}: DataTableProps<TData>) {
  // 1. Sorting State (uncontrolled fallback)
  const [internalSorting, setInternalSorting] = useState<SortingState>(defaultSorting);
  const sorting = controlledSorting !== undefined ? controlledSorting : internalSorting;

  const updateSorting = useCallback(
    (newSorting: SortingState) => {
      if (onSortingChange) {
        onSortingChange(newSorting);
      }
      if (controlledSorting === undefined) {
        setInternalSorting(newSorting);
      }
    },
    [controlledSorting, onSortingChange],
  );

  const toggleColumnSort = useCallback(
    (columnId: string, multi: boolean = false) => {
      const isMulti = enableMultiSort && multi;
      const existingIndex = sorting.findIndex((s) => s.id === columnId);

      if (isMulti) {
        if (existingIndex === -1) {
          // Add as next priority sort column
          updateSorting([...sorting, { id: columnId, desc: false, priority: sorting.length + 1 }]);
        } else {
          const existing = sorting[existingIndex];
          if (!existing.desc) {
            // Flip asc -> desc
            const next = [...sorting];
            next[existingIndex] = { ...existing, desc: true };
            updateSorting(next);
          } else {
            // Remove from multi-sort and re-index priorities
            const next = sorting
              .filter((_, i) => i !== existingIndex)
              .map((s, idx) => ({ ...s, priority: idx + 1 }));
            updateSorting(next);
          }
        }
      } else {
        // Single column toggle: asc -> desc -> clear
        if (existingIndex === -1) {
          updateSorting([{ id: columnId, desc: false, priority: 1 }]);
        } else {
          const existing = sorting[existingIndex];
          if (!existing.desc) {
            updateSorting([{ id: columnId, desc: true, priority: 1 }]);
          } else {
            updateSorting([]);
          }
        }
      }
    },
    [enableMultiSort, sorting, updateSorting],
  );

  // 2. Pagination State (uncontrolled fallback)
  const [internalPagination, setInternalPagination] = useState<PaginationState>(defaultPagination);
  const pagination = controlledPagination !== undefined ? controlledPagination : internalPagination;

  const updatePagination = useCallback(
    (newPagination: PaginationState) => {
      if (onPaginationChange) {
        onPaginationChange(newPagination);
      }
      if (controlledPagination === undefined) {
        setInternalPagination(newPagination);
      }
    },
    [controlledPagination, onPaginationChange],
  );

  // 3. Client-side Search / Filtering
  const filteredData = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase().trim();

    if (filterFn) {
      return data.filter((row) => filterFn(row, q));
    }

    return data.filter((row) => {
      return columns.some((col) => {
        const key = (col.accessorKey || col.id) as keyof TData;
        if (!key) return false;
        const val = row[key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      });
    });
  }, [columns, data, filterFn, searchQuery]);

  // 4. Client-side Multi-column Sorting
  const sortedData = useMemo(() => {
    if (manualSorting || sorting.length === 0) {
      return filteredData;
    }

    const colMap = new Map<string, ColumnDef<TData>>();
    columns.forEach((col, index) => {
      const colId = getColumnId(col, index);
      colMap.set(colId, col);
    });

    return [...filteredData].sort((a, b) => {
      for (const sort of sorting) {
        const col = colMap.get(sort.id);
        if (col?.sortingFn) {
          const customRes = col.sortingFn(a, b, sort.desc);
          if (customRes !== 0) return customRes;
        } else {
          const key = (col?.accessorKey || sort.id) as keyof TData;
          const valA = a[key];
          const valB = b[key];

          if (valA === valB) continue;
          if (valA === null || valA === undefined) return sort.desc ? 1 : -1;
          if (valB === null || valB === undefined) return sort.desc ? -1 : 1;

          let diff: number;
          if (typeof valA === "number" && typeof valB === "number") {
            diff = valA - valB;
          } else if (typeof valA === "string" && typeof valB === "string") {
            diff = valA.localeCompare(valB, undefined, { numeric: true });
          } else if (valA instanceof Date && valB instanceof Date) {
            diff = valA.getTime() - valB.getTime();
          } else {
            diff = String(valA).localeCompare(String(valB));
          }

          if (diff !== 0) {
            return sort.desc ? -diff : diff;
          }
        }
      }
      return 0;
    });
  }, [columns, filteredData, manualSorting, sorting]);

  // 5. Client-side Pagination Slicing
  const totalCount = manualPagination ? (controlledTotalRows ?? data.length) : sortedData.length;

  const calculatedPageCount = manualPagination
    ? (controlledPageCount ?? Math.ceil(totalCount / pagination.pageSize))
    : Math.max(1, Math.ceil(sortedData.length / pagination.pageSize));

  const maxPageIndex = Math.max(0, calculatedPageCount - 1);
  const effectivePageIndex = manualPagination
    ? pagination.pageIndex
    : Math.min(Math.max(0, pagination.pageIndex), maxPageIndex);

  const paginatedData = useMemo(() => {
    if (!enablePagination || manualPagination) {
      return sortedData;
    }
    const start = effectivePageIndex * pagination.pageSize;
    return sortedData.slice(start, start + pagination.pageSize);
  }, [effectivePageIndex, enablePagination, manualPagination, pagination.pageSize, sortedData]);

  // Helper row value extraction
  const getCellValue = (row: TData, col: ColumnDef<TData>) => {
    const key = (col.accessorKey || col.id) as keyof TData;
    return key ? row[key] : undefined;
  };

  const startEntry = totalCount === 0 ? 0 : effectivePageIndex * pagination.pageSize + 1;
  const endEntry = Math.min(totalCount, (effectivePageIndex + 1) * pagination.pageSize);

  return (
    <div className={cn("space-y-4 w-full", containerClassName)}>
      <div
        className={cn(
          "rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-xs overflow-hidden",
          className,
        )}
      >
        <Table className={tableClassName} aria-busy={isLoading}>
          <TableHeader className="bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-200 dark:border-zinc-800">
            <TableRow className="hover:bg-transparent">
              {columns.map((column, colIndex) => {
                const columnId = getColumnId(column, colIndex);
                const sortIndex = sorting.findIndex((s) => s.id === columnId);
                const isSorted = sortIndex !== -1;
                const sortConfig = isSorted ? sorting[sortIndex] : undefined;
                const sortDirection = sortConfig?.desc ? "desc" : "asc";
                const isSortable = column.enableSorting !== false;

                const headerContext: HeaderContext<TData> = {
                  column,
                  sorting: sortConfig,
                  isSorted,
                  sortDirection: isSorted ? sortDirection : undefined,
                  sortPriority: isSorted ? sortIndex + 1 : undefined,
                  toggleSorting: (multi) => toggleColumnSort(columnId, multi),
                };

                const ariaSort = isSorted
                  ? sortDirection === "asc"
                    ? "ascending"
                    : "descending"
                  : isSortable
                    ? "none"
                    : undefined;

                return (
                  <TableHead
                    key={columnId}
                    aria-sort={ariaSort}
                    className={cn(
                      "text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-3.5 select-none",
                      column.headerClassName,
                    )}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={(e) => toggleColumnSort(columnId, e.shiftKey)}
                        className="group inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
                        title={
                          isSorted
                            ? `Sorted ${sortDirection}. Click to change, Shift+Click for multi-column.`
                            : "Click to sort, Shift+Click for multi-column."
                        }
                      >
                        <span>
                          {typeof column.header === "function"
                            ? column.header(headerContext)
                            : column.header}
                        </span>

                        <span className="inline-flex items-center gap-0.5">
                          {isSorted ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 font-bold" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 opacity-60 group-hover:opacity-100 transition-opacity" />
                          )}

                          {sorting.length > 1 && isSorted && (
                            <span className="text-[9px] font-bold px-1 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 leading-tight">
                              {sortIndex + 1}
                            </span>
                          )}
                        </span>
                      </button>
                    ) : (
                      <span>
                        {typeof column.header === "function"
                          ? column.header(headerContext)
                          : column.header}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableSkeleton columns={columns} rowCount={skeletonRowCount} />
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-36 text-center text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, rowIndex) => {
                const rowKey = getRowId ? getRowId(row, rowIndex) : `data-row-${rowIndex}`;
                const isClickable = Boolean(onRowClick);

                const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
                  if (!onRowClick) return;
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(row, rowIndex);
                  }
                };

                return (
                  <TableRow
                    key={rowKey}
                    onClick={() => onRowClick?.(row, rowIndex)}
                    onKeyDown={isClickable ? handleKeyDown : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    className={cn(
                      "border-b border-slate-100 dark:border-zinc-800/80 transition-colors",
                      isClickable &&
                        "cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50 focus:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-zinc-800/60 focus-visible:ring-1 focus-visible:ring-indigo-500",
                    )}
                  >
                    {columns.map((column, colIndex) => {
                      const columnId = getColumnId(column, colIndex);
                      const value = getCellValue(row, column);

                      return (
                        <TableCell
                          key={columnId}
                          className={cn(
                            "py-4 text-xs text-zinc-800 dark:text-zinc-200",
                            column.cellClassName,
                          )}
                        >
                          {column.cell
                            ? column.cell({ row, value, index: rowIndex })
                            : value !== null && value !== undefined
                              ? String(value)
                              : "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {enablePagination && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-1 py-1 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-3">
            <span>
              Showing{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">{startEntry}</strong>{" "}
              to <strong className="font-semibold text-zinc-900 dark:text-white">{endEntry}</strong>{" "}
              of{" "}
              <strong className="font-semibold text-zinc-900 dark:text-white">{totalCount}</strong>{" "}
              entries
            </span>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 ml-2">
              <span>Show</span>
              <select
                value={pagination.pageSize}
                onChange={(e) =>
                  updatePagination({
                    pageIndex: 0,
                    pageSize: Number(e.target.value),
                  })
                }
                className="h-8 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => updatePagination({ ...pagination, pageIndex: 0 })}
              disabled={effectivePageIndex === 0 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="First page"
              title="First page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                updatePagination({
                  ...pagination,
                  pageIndex: Math.max(0, effectivePageIndex - 1),
                })
              }
              disabled={effectivePageIndex === 0 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 font-semibold text-zinc-800 dark:text-zinc-200">
              {`Page ${effectivePageIndex + 1} of ${calculatedPageCount}`}
            </span>

            <button
              type="button"
              onClick={() =>
                updatePagination({
                  ...pagination,
                  pageIndex: Math.min(calculatedPageCount - 1, effectivePageIndex + 1),
                })
              }
              disabled={effectivePageIndex >= calculatedPageCount - 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
              title="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                updatePagination({ ...pagination, pageIndex: calculatedPageCount - 1 })
              }
              disabled={effectivePageIndex >= calculatedPageCount - 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Last page"
              title="Last page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
