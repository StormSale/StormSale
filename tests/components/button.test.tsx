import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "../../src/components/ui/button";

const variants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
const sizes = ["default", "sm", "lg", "icon"] as const;

describe("Button visual baseline", () => {
  describe.each(variants)("variant: %s", (variant) => {
    it.each(sizes)("size: %s", (size) => {
      const { container } = render(
        <Button variant={variant} size={size}>
          {size === "icon" ? "+" : "Click me"}
        </Button>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it("disabled", () => {
      const { container } = render(
        <Button variant={variant} disabled>
          Disabled
        </Button>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  it("renders with default variant and size when none are given", () => {
    const { container } = render(<Button>Default</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("merges a custom className", () => {
    const { container } = render(<Button className="w-full">Full width</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders as the child element when asChild is set", () => {
    const { container } = render(
      <Button asChild variant="link">
        <a href="/docs">Docs</a>
      </Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
