import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Skeleton,
  CardSkeleton,
  TableSkeleton,
  CampaignCardSkeleton,
  ChartSkeleton,
  FormSkeleton,
  SkeletonWrapper,
} from "../components/ui/skeleton";

describe("[UI] Visual Feedback & Skeleton System (#14)", () => {
  describe("Base Skeleton Component", () => {
    it("renders with pulsing Zinc-800 animation and accessible role", () => {
      const html = renderToString(<Skeleton className="h-6 w-24" />);

      // Acceptance Criteria: Pulsing Zinc-800 animation
      expect(html).toContain("animate-pulse");
      expect(html).toContain("dark:bg-zinc-800");
      expect(html).toContain("bg-slate-200/80");

      // Accessibility attributes
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Loading..."');
      expect(html).toContain("h-6 w-24");
    });

    it("applies circular variant correctly", () => {
      const html = renderToString(<Skeleton variant="circular" className="w-12 h-12" />);
      expect(html).toContain("rounded-full");
      expect(html).toContain("animate-pulse");
      expect(html).toContain("dark:bg-zinc-800");
    });

    it("applies rounded and text variants correctly", () => {
      const roundedHtml = renderToString(<Skeleton variant="rounded" />);
      expect(roundedHtml).toContain("rounded-2xl");

      const textHtml = renderToString(<Skeleton variant="text" />);
      expect(textHtml).toContain("h-4");
      expect(textHtml).toContain("w-full");
    });

    it("merges custom tailwind classes without collision", () => {
      const html = renderToString(<Skeleton className="custom-test-class opacity-75" />);
      expect(html).toContain("custom-test-class");
      expect(html).toContain("opacity-75");
    });
  });

  describe("Dimension-Matched Dashboard Skeletons (CLS Prevention)", () => {
    it("renders CardSkeleton with dimension matching for stat cards", () => {
      const html = renderToString(<CardSkeleton />);

      expect(html).toContain("min-h-[148px]");
      expect(html).toContain("border-slate-200/80");
      expect(html).toContain("dark:border-zinc-800");
      expect(html).toContain("animate-pulse");
      expect(html).toContain('aria-label="Loading card..."');
    });

    it("supports toggling icon and badge in CardSkeleton", () => {
      const noIconNoBadge = renderToString(<CardSkeleton hasIcon={false} hasBadge={false} />);
      expect(noIconNoBadge).not.toContain("w-10 h-10 rounded-xl");
      expect(noIconNoBadge).not.toContain("w-16 rounded-full");
    });

    it("renders TableSkeleton with configurable rows and columns", () => {
      const rows = 4;
      const columns = 5;
      const html = renderToString(
        <TableSkeleton rows={rows} columns={columns} showHeader={true} />,
      );

      expect(html).toContain('aria-label="Loading table..."');
      expect(html).toContain("min-h-[56px]"); // cell row height matching
      expect(html).toContain("animate-pulse");
      expect(html).toContain("dark:bg-zinc-800");

      // Verify header and row structure
      expect(html).toContain("border-b border-slate-200 dark:border-zinc-800");
    });

    it("renders TableSkeleton without header when showHeader is false", () => {
      const html = renderToString(<TableSkeleton rows={3} showHeader={false} />);
      expect(html).not.toContain("bg-slate-50/60 dark:bg-zinc-900/80 px-6 py-4");
    });

    it("applies custom columnWidths in TableSkeleton", () => {
      const customWidths = ["w-1/4", "w-1/4", "w-1/2"];
      const html = renderToString(
        <TableSkeleton rows={2} columns={3} columnWidths={customWidths} />,
      );
      expect(html).toContain("w-1/4");
      expect(html).toContain("w-1/2");
    });

    it("renders CampaignCardSkeleton matching directory cards", () => {
      const html = renderToString(<CampaignCardSkeleton />);

      expect(html).toContain("min-h-[260px]"); // Exact campaign card dimension
      expect(html).toContain("grid-cols-3"); // 3-column stats block
      expect(html).toContain("animate-pulse");
      expect(html).toContain("dark:bg-zinc-800");
    });

    it("renders ChartSkeleton with staggered bar heights and axis labels", () => {
      const barCount = 6;
      const html = renderToString(<ChartSkeleton height={200} barCount={barCount} />);

      expect(html).toContain('aria-label="Loading chart..."');
      expect(html).toContain("style=\"height:200px\"");
      expect(html).toContain("rounded-t-lg");
      expect(html).toContain("dark:bg-zinc-800");
    });

    it("renders FormSkeleton matching input field groups", () => {
      const fieldsCount = 4;
      const html = renderToString(<FormSkeleton fieldsCount={fieldsCount} />);

      expect(html).toContain('aria-label="Loading form..."');
      expect(html).toContain("h-12 w-full rounded-xl"); // Input dimension
      expect(html).toContain("h-14 w-full rounded-xl"); // Submit button dimension
    });
  });

  describe("SkeletonWrapper Utility", () => {
    it("renders skeleton placeholder when isLoading is true", () => {
      const html = renderToString(
        <SkeletonWrapper isLoading={true} skeleton={<CardSkeleton className="test-skeleton" />}>
          <div className="actual-content">Real Metric Card</div>
        </SkeletonWrapper>,
      );

      expect(html).toContain("test-skeleton");
      expect(html).toContain("min-h-[148px]");
      expect(html).not.toContain("Real Metric Card");
    });

    it("renders children content when isLoading is false", () => {
      const html = renderToString(
        <SkeletonWrapper isLoading={false} skeleton={<CardSkeleton className="test-skeleton" />}>
          <div className="actual-content">Real Metric Card</div>
        </SkeletonWrapper>,
      );

      expect(html).toContain("actual-content");
      expect(html).toContain("Real Metric Card");
      expect(html).not.toContain("test-skeleton");
    });
  });
});
