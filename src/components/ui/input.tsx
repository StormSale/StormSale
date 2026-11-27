import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "success" | "error" | "warning";
}

export interface InputFieldProps extends InputProps {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  errorMessage?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    const variantStyles = {
      default:
        "border-gray-300 focus:ring-emerald-500 focus:border-slate-200 dark:border-slate-800 dark:border-gray-600",
      success:
        "border-slate-200 dark:border-slate-800 focus:ring-emerald-500 focus:border-slate-200 dark:border-slate-800 dark:border-slate-200 dark:border-slate-800",
      error: "border-red-500 focus:ring-red-500 focus:border-red-500 dark:border-red-400",
      warning:
        "border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500 dark:border-yellow-400",
    };

    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-xl border-2 bg-background px-4 py-3 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 shadow-sm",
          variantStyles[variant],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ leading, trailing, errorMessage, variant, className, ...props }, ref) => (
    <div className="grid gap-1.5">
      <div className="relative">
        {leading && <span className="absolute inset-y-0 left-3 flex items-center">{leading}</span>}
        <Input ref={ref} variant={errorMessage ? "error" : variant} aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? `${props.id ?? props.name}-error` : props["aria-describedby"]}
          className={cn(leading && "pl-10", trailing && "pr-10", className)} {...props} />
        {trailing && <span className="absolute inset-y-0 right-3 flex items-center">{trailing}</span>}
      </div>
      {errorMessage && <p id={`${props.id ?? props.name}-error`} className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  ),
);
InputField.displayName = "InputField";
