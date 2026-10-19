import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  Dialog,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogVariants,
} from "../components/ui/dialog";

describe("[UI] Unified Radix Modal Component Suite (#11)", () => {
  describe("dialogVariants sizing classes", () => {
    it("applies default size (lg) max-width styling correctly", () => {
      const classes = dialogVariants({ size: "lg" });
      expect(classes).toContain("max-w-lg");
      expect(classes).toContain("fixed");
      expect(classes).toContain("z-50");
    });

    it("applies sm size variant", () => {
      const classes = dialogVariants({ size: "sm" });
      expect(classes).toContain("max-w-sm");
    });

    it("applies md size variant", () => {
      const classes = dialogVariants({ size: "md" });
      expect(classes).toContain("max-w-md");
    });

    it("applies xl size variant", () => {
      const classes = dialogVariants({ size: "xl" });
      expect(classes).toContain("max-w-2xl");
    });

    it("applies full size variant", () => {
      const classes = dialogVariants({ size: "full" });
      expect(classes).toContain("w-[95vw]");
      expect(classes).toContain("h-[95vh]");
    });

    it("applies mobile-full size variant with responsive transitions", () => {
      const classes = dialogVariants({ size: "mobile-full" });
      expect(classes).toContain("w-full");
      expect(classes).toContain("h-full");
      expect(classes).toContain("sm:max-w-lg");
    });
  });

  describe("Accessible subcomponents rendering", () => {
    it("renders DialogHeader with proper flex styles", () => {
      const html = renderToString(
        <DialogHeader className="custom-header">
          <span>Header Content</span>
        </DialogHeader>,
      );
      expect(html).toContain("custom-header");
      expect(html).toContain("flex flex-col");
      expect(html).toContain("Header Content");
    });

    it("renders DialogFooter with responsive flex reverse direction", () => {
      const html = renderToString(
        <DialogFooter className="custom-footer">
          <button>Submit</button>
        </DialogFooter>,
      );
      expect(html).toContain("custom-footer");
      expect(html).toContain("flex-col-reverse");
      expect(html).toContain("sm:flex-row");
      expect(html).toContain("Submit");
    });

    it("renders DialogTitle with accessible heading styling", () => {
      const html = renderToString(
        <Dialog open>
          <DialogTitle className="custom-title">Modal Title</DialogTitle>
        </Dialog>,
      );
      expect(html).toContain("custom-title");
      expect(html).toContain("font-semibold");
      expect(html).toContain("Modal Title");
    });

    it("renders DialogDescription with muted accessibility text", () => {
      const html = renderToString(
        <Dialog open>
          <DialogDescription className="custom-desc">
            Modal explanatory context
          </DialogDescription>
        </Dialog>,
      );
      expect(html).toContain("custom-desc");
      expect(html).toContain("text-muted-foreground");
      expect(html).toContain("Modal explanatory context");
    });
  });
});
