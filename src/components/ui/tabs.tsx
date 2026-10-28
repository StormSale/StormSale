import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

interface TabsContextValue {
  value: string;
  id: string;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

function getTabValues(children: React.ReactNode): string[] {
  const values: string[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; value?: string }>(child)) return;
    if (child.type === TabsTrigger && typeof child.props.value === "string") {
      values.push(child.props.value);
    } else if (child.props.children) {
      values.push(...getTabValues(child.props.children));
    }
  });
  return values;
}

function useTabsContext() {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used inside Tabs.");
  return context;
}

export interface TabsProps extends React.ComponentPropsWithoutRef<"div"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  queryParam?: string;
  storageKey?: string;
}

export function Tabs({
  value,
  defaultValue = "",
  onValueChange,
  queryParam,
  storageKey,
  className,
  children,
  ...props
}: TabsProps) {
  const id = React.useId();
  const validValuesKey = JSON.stringify(getTabValues(children));
  const validValues = React.useMemo(() => JSON.parse(validValuesKey) as string[], [validValuesKey]);
  const fallbackValue = validValues.includes(defaultValue) ? defaultValue : (validValues[0] ?? "");
  const persistenceId = storageKey ?? queryParam;
  const preferenceKey = persistenceId
    ? `stormsale.tabs:${typeof window === "undefined" ? "" : window.location.pathname}:${persistenceId}`
    : null;
  const onValueChangeRef = React.useRef(onValueChange);
  const valueRef = React.useRef(value);

  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
    valueRef.current = value;
  }, [onValueChange, value]);

  const [internalValue, setInternalValue] = React.useState(() => {
    if (typeof window === "undefined") return fallbackValue;
    const requestedValue = queryParam
      ? new URLSearchParams(window.location.search).get(queryParam)
      : null;
    if (requestedValue && validValues.includes(requestedValue)) return requestedValue;
    try {
      const savedValue = preferenceKey ? window.localStorage.getItem(preferenceKey) : null;
      return savedValue && validValues.includes(savedValue) ? savedValue : fallbackValue;
    } catch {
      return fallbackValue;
    }
  });
  const activeValue = validValues.includes(value ?? internalValue)
    ? (value ?? internalValue)
    : fallbackValue;

  const setValue = React.useCallback(
    (nextValue: string) => {
      if (valueRef.current === undefined) setInternalValue(nextValue);
      onValueChangeRef.current?.(nextValue);

      if (validValues.includes(nextValue) && preferenceKey && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(preferenceKey, nextValue);
        } catch {
          // Storage may be unavailable in private browsing contexts.
        }
      }

      if (validValues.includes(nextValue) && queryParam && typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get(queryParam) !== nextValue) {
          params.set(queryParam, nextValue);
          const search = params.toString();
          window.history.pushState(
            window.history.state,
            "",
            `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
          );
        }
      }
    },
    [preferenceKey, queryParam, validValues],
  );

  React.useEffect(() => {
    if (!queryParam || typeof window === "undefined") return;

    const syncFromLocation = () => {
      const nextValue = new URLSearchParams(window.location.search).get(queryParam);
      const resolvedValue =
        nextValue && validValues.includes(nextValue) ? nextValue : fallbackValue;
      if (valueRef.current === undefined) setInternalValue(resolvedValue);
      onValueChangeRef.current?.(resolvedValue);
      if (preferenceKey) {
        try {
          window.localStorage.setItem(preferenceKey, resolvedValue);
        } catch {
          // Storage may be unavailable in private browsing contexts.
        }
      }
    };

    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [fallbackValue, preferenceKey, queryParam, validValues]);

  const contextValue = React.useMemo(
    () => ({ value: activeValue, id, setValue }),
    [activeValue, id, setValue],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends React.ComponentPropsWithoutRef<"div"> {
  orientation?: "horizontal" | "vertical";
}

export function TabsList({ orientation = "horizontal", className, ...props }: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-orientation={orientation}
      className={cn(
        "inline-flex items-center justify-start gap-1 border-b border-slate-200 dark:border-zinc-800",
        className,
      )}
      {...props}
    />
  );
}

export interface TabsTriggerProps extends React.ComponentPropsWithoutRef<"button"> {
  value: string;
}

export function TabsTrigger({
  value,
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: TabsTriggerProps) {
  const context = useTabsContext();
  const selected = context.value === value;
  const panelId = `${context.id}-panel-${value}`;

  return (
    <button
      type="button"
      role="tab"
      id={`${context.id}-tab-${value}`}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? "active" : "inactive"}
      className={cn(
        "relative inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap px-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-100",
        selected && "text-zinc-950 dark:text-white",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setValue(value);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;

        const tabs = Array.from(
          event.currentTarget
            .closest('[role="tablist"]')
            ?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [],
        );
        if (tabs.length === 0) return;

        const currentIndex = tabs.indexOf(event.currentTarget);
        const orientation = event.currentTarget
          .closest('[role="tablist"]')
          ?.getAttribute("aria-orientation");
        const forwardKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
        const backwardKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
        let nextIndex: number;
        if (event.key === forwardKey) nextIndex = (currentIndex + 1) % tabs.length;
        else if (event.key === backwardKey)
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = tabs.length - 1;
        else return;

        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      }}
      {...props}
    >
      {children}
      {selected && (
        <motion.span
          layoutId={`${context.id}-indicator`}
          className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600 dark:bg-indigo-400"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}

export interface TabsContentProps extends React.ComponentPropsWithoutRef<typeof motion.div> {
  value: string;
}

export function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const context = useTabsContext();
  const selected = context.value === value;

  if (!selected) return null;

  return (
    <motion.div
      role="tabpanel"
      id={`${context.id}-panel-${value}`}
      aria-labelledby={`${context.id}-tab-${value}`}
      tabIndex={0}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={cn("outline-none focus-visible:ring-2 focus-visible:ring-indigo-500", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
