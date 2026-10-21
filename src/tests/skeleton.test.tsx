import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonMetric,
  SkeletonWidget,
  SkeletonTable,
} from "../components/ui/skeleton";

describe("SkeletonLoader System (#7, #4)", () => {
  it("renders base skeleton with pulse and zinc styling", () => {
    const html = renderToStaticMarkup(<Skeleton className="h-6 w-32" />);
    expect(html).toContain("animate-pulse");
    expect(html).toContain("dark:bg-zinc-800");
    expect(html).toContain("h-6");
    expect(html).toContain("w-32");
    expect(html).toContain('role="status"');
  });

  it("supports zinc800 variant", () => {
    const html = renderToStaticMarkup(<Skeleton variant="zinc800" />);
    expect(html).toContain("bg-zinc-800");
    expect(html).toContain("animate-pulse");
  });

  it("renders multi-line text skeleton with specified line count", () => {
    const html = renderToStaticMarkup(<SkeletonText lines={4} />);
    const lineMatches = html.match(/role="status"/g);
    expect(lineMatches).toHaveLength(4);
  });

  it("renders avatar skeleton with varying sizes", () => {
    const small = renderToStaticMarkup(<SkeletonAvatar size="sm" />);
    expect(small).toContain("w-8");
    expect(small).toContain("h-8");
    expect(small).toContain("rounded-full");

    const large = renderToStaticMarkup(<SkeletonAvatar size="lg" />);
    expect(large).toContain("w-12");
    expect(large).toContain("h-12");
  });

  it("renders button skeleton matching standard dimensions", () => {
    const defaultBtn = renderToStaticMarkup(<SkeletonButton size="default" />);
    expect(defaultBtn).toContain("h-9");
    expect(defaultBtn).toContain("w-28");

    const iconBtn = renderToStaticMarkup(<SkeletonButton size="icon" />);
    expect(iconBtn).toContain("h-8");
    expect(iconBtn).toContain("w-8");
  });

  it("renders dashboard metric card skeleton with subtext", () => {
    const html = renderToStaticMarkup(<SkeletonMetric hasSubtext={true} />);
    expect(html).toContain("border-zinc-200");
    expect(html).toContain("dark:border-zinc-800");
    expect(html).toContain("p-6");
    // Verify header, metric, and subtext lines
    const elements = html.match(/role="status"/g);
    expect(elements && elements.length).toBeGreaterThanOrEqual(4);
  });

  it("renders widget card skeleton with custom height", () => {
    const html = renderToStaticMarkup(<SkeletonWidget height="h-64" showHeaderAction={true} />);
    expect(html).toContain("h-64");
    expect(html).toContain("shadow-sm");
  });

  it("renders table skeleton with specified rows and columns without layout shift", () => {
    const html = renderToStaticMarkup(<SkeletonTable rows={3} columns={5} showPagination={true} />);
    expect(html).toContain("overflow-hidden");
    // Header has 5 columns
    // 3 rows * 5 cells = 15 cells + 5 header + pagination elements
    const elements = html.match(/role="status"/g);
    expect(elements && elements.length).toBeGreaterThanOrEqual(20);
  });
});
