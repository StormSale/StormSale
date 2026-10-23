import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../../lib/utils";

export interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  ariaLabel?: string;
}

/**
 * Slider component built on Radix UI Slider primitive.
 * Supports accessible keyboard controls, ARIA labeling, and responsive touch gestures.
 */
const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, ariaLabel, ...props }, ref) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center py-2 cursor-pointer",
        className,
      )}
      aria-label={ariaLabel}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
        <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-indigo-500 to-indigo-600 dark:from-indigo-500 dark:to-indigo-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-5 w-5 rounded-full border-2 border-indigo-600 dark:border-indigo-400 bg-white dark:bg-zinc-950 shadow-md ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 cursor-grab active:cursor-grabbing"
        aria-label={ariaLabel}
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
