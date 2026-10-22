import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { TRANSACTION_COOLDOWN_MS, createCooldownGuard, runGuardedClick } from "../../lib/cooldown";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Transaction lockout. `true` locks the button for
   * {@link TRANSACTION_COOLDOWN_MS} (2s) after each click, and for as long as
   * an async `onClick` is still running if that is longer; a number sets the
   * cooldown in milliseconds. Clicks during the lockout are refused before any
   * handler runs, which `disabled={isLoading}` alone cannot do.
   */
  cooldown?: boolean | number;
  /**
   * The caller's own "transaction in flight" flag. Locks the button with the
   * same look as the cooldown, for work the button cannot see — a submit
   * button's form handler, for instance.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      cooldown,
      loading = false,
      onClick,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const cooldownMs =
      cooldown === true ? TRANSACTION_COOLDOWN_MS : typeof cooldown === "number" ? cooldown : 0;
    const guarded = cooldownMs > 0 && !asChild;

    const [coolingDown, setCoolingDown] = React.useState(false);
    const [guard] = React.useState(() =>
      createCooldownGuard({ cooldownMs, onChange: setCoolingDown }),
    );
    React.useEffect(() => () => guard.dispose(), [guard]);

    const handleClick = React.useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!guarded) {
          onClick?.(event);
          return;
        }
        runGuardedClick(guard, event, onClick);
      },
      [guard, guarded, onClick],
    );

    const locked = coolingDown || loading;
    const Comp = asChild ? Slot : "button";

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          onClick={onClick}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        // Visual lockout: the variant's disabled styles (dimmed, inert), the
        // spinner below during the cooldown, and aria-busy for assistive tech.
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        disabled={disabled || locked}
        aria-busy={locked || undefined}
        data-state={loading ? "loading" : coolingDown ? "cooldown" : undefined}
        {...props}
      >
        {/* While the caller shows its own in-flight content (`loading`), it
            keeps its own spinner; the cooldown that follows gets this one, so
            the lockout stays visible after a fast transaction returns. */}
        {coolingDown && !loading && (
          <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" aria-hidden="true" />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
