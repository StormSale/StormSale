import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { Button, buttonVariants } from "../../src/components/ui/button";
import { CopyButton } from "../../src/components/ui/copy-button";
import { NotificationProvider } from "../../src/context/NotificationContext";

describe("[Snapshot] UI Button Primitives & Variants (#90)", () => {
  describe("Button Style Variants", () => {
    const variants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;

    variants.forEach((variant) => {
      it(`matches snapshot for variant: "${variant}"`, () => {
        const html = renderToString(<Button variant={variant}>Button {variant}</Button>);
        expect(html).toMatchSnapshot();
      });
    });
  });

  describe("Button Sizes", () => {
    const sizes = ["default", "sm", "lg", "icon"] as const;

    sizes.forEach((size) => {
      it(`matches snapshot for size: "${size}"`, () => {
        const html = renderToString(
          <Button size={size}>{size === "icon" ? <span>★</span> : `Size ${size}`}</Button>,
        );
        expect(html).toMatchSnapshot();
      });
    });
  });

  describe("Button Interactive & Guard States", () => {
    it("matches snapshot for disabled button", () => {
      const html = renderToString(<Button disabled>Disabled Action</Button>);
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for loading button", () => {
      const html = renderToString(<Button loading>Processing Transaction</Button>);
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for button with custom cooldown", () => {
      const html = renderToString(<Button cooldown={3000}>Guarded Click</Button>);
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for button with custom className and attributes", () => {
      const html = renderToString(
        <Button className="w-full shadow-lg hover:shadow-xl" data-testid="custom-button">
          Full Width Action
        </Button>,
      );
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for button with icon and label", () => {
      const html = renderToString(
        <Button variant="outline" size="sm">
          <span className="mr-2">⚙</span>
          Settings
        </Button>,
      );
      expect(html).toMatchSnapshot();
    });
  });

  describe("buttonVariants CVA helper", () => {
    it("generates deterministic classes for combined variant and size", () => {
      const classes = buttonVariants({ variant: "destructive", size: "sm" });
      expect(classes).toMatchSnapshot();
    });
  });

  describe("CopyButton Component Variants", () => {
    it("matches snapshot for default CopyButton", () => {
      const html = renderToString(
        <NotificationProvider>
          <CopyButton value="GBZXN7PIRZGNMHGA728RGRYA7XPO5CFSGSJAA5T6Q5WWC62MWFPZ4ES2" />
        </NotificationProvider>,
      );
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for CopyButton with label and hash variant", () => {
      const html = renderToString(
        <NotificationProvider>
          <CopyButton value="tx_8f3a9d20c1" label="Copy Hash" variant="hash" showToast={false} />
        </NotificationProvider>,
      );
      expect(html).toMatchSnapshot();
    });

    it("matches snapshot for CopyButton with address variant and custom className", () => {
      const html = renderToString(
        <NotificationProvider>
          <CopyButton
            value="GA2C5RFPE6GCKMY3US5PAB6UZLKIGAHWKXX2UJAET73KYIIZRVKMLVY7"
            variant="address"
            className="border-dashed"
          />
        </NotificationProvider>,
      );
      expect(html).toMatchSnapshot();
    });
  });
});
