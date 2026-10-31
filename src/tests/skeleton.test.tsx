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
  CardSkeleton,
  CampaignCardSkeleton,
  ChartSkeleton,
  FormSkeleton,
  SkeletonWrapper,
} from "../components/ui/skeleton";

describe("SkeletonLoader System (#7, #4) + Visual Feedback & Skeleton System (#14)", () => {
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

  it("supports circular, rounded, and text variants", () => {
    const circular = renderToStaticMarkup(<Skeleton variant="circular" className="w-12 h-12" />);
    expect(circular).toContain("rounded-full");

    const rounded = renderToStaticMarkup(<Skeleton variant="rounded" />);
    expect(rounded).toContain("rounded-2xl");

    const text = renderToStaticMarkup(<Skeleton variant="text" />);
    expect(text).toContain("h-4");
    expect(text).toContain("w-full");
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
    const elements = html.match(/role="status"/g);
    expect(elements && elements.length).toBeGreaterThanOrEqual(20);
  });

  it("renders new CardSkeleton with expected dashboard sizing", () => {
    const html = renderToStaticMarkup(<CardSkeleton />);
    expect(html).toContain("min-h-[148px]");
    expect(html).toContain("border-slate-200/80");
    expect(html).toContain("dark:border-zinc-800");
    expect(html).toContain("animate-pulse");
  });

  it("renders new TableSkeleton with configurable rows/columns and header toggle", () => {
    const html = renderToStaticMarkup(
      <SkeletonTable rows={4} columns={5} showHeader={true} columnWidths={["w-1/4", "w-1/4", "w-1/2"]} />,
    );
    expect(html).toContain("min-h-[56px]");
    expect(html).toContain("w-1/4");
    expect(html).toContain("w-1/2");
    expect(html).toContain("border-zinc-200");
    expect(html).toContain("bg-zinc-50");
    expect(html).not.toContain("w-1/3");
    expect(html).not.toContain("w-1/5");
    expect(html).not.toContain("w-1/6");

    const htmlNoHeader = renderToStaticMarkup(
      <SkeletonTable rows={3} columns={3} showHeader={false} />,
    );
    expect(htmlNoHeader).not.toContain("bg-zinc-50");
  });

  it("renders CampaignCardSkeleton matching directory cards", () => {
    const html = renderToStaticMarkup(<CampaignCardSkeleton />);
    expect(html).toContain("min-h-[260px]");
    expect(html).toContain("grid-cols-3");
    expect(html).toContain("animate-pulse");
  });

  it("renders ChartSkeleton with staggered bar heights and axis labels", () => {
    const html = renderToStaticMarkup(<ChartSkeleton height={200} barCount={6} />);
    expect(html).toContain('aria-label="Loading chart..."');
    expect(html).toContain("style=\"height:200px\"");
    expect(html).toContain("rounded-t-lg");
  });

  it("renders FormSkeleton matching input field groups", () => {
    const html = renderToStaticMarkup(<FormSkeleton fieldsCount={4} />);
    expect(html).toContain('aria-label="Loading form..."');
    expect(html).toContain("h-12 w-full rounded-xl");
    expect(html).toContain("h-14 w-full rounded-xl");
  });

  it("renders skeleton placeholder when isLoading is true", () => {
    const html = renderToStaticMarkup(
      <SkeletonWrapper isLoading={true} skeleton={<CardSkeleton className="test-skeleton" />}>
        <div className="actual-content">Real Metric Card</div>
      </SkeletonWrapper>,
    );

    expect(html).toContain("test-skeleton");
    expect(html).toContain("min-h-[148px]");
    expect(html).not.toContain("Real Metric Card");
  });

  it("renders children content when isLoading is false", () => {
    const html = renderToStaticMarkup(
      <SkeletonWrapper isLoading={false} skeleton={<CardSkeleton className="test-skeleton" />}>
        <div className="actual-content">Real Metric Card</div>
      </SkeletonWrapper>,
    );

    expect(html).toContain("actual-content");
    expect(html).toContain("Real Metric Card");
    expect(html).not.toContain("test-skeleton");
  });
});