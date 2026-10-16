import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Input } from "../../src/components/ui/input";
import { Label } from "../../src/components/ui/label";
import { InputField, InputGroup } from "../../src/components/ui/input-group";

describe("Input visual baseline", () => {
  it.each(["default", "success", "error", "warning"] as const)("variant: %s", (variant) => {
    const { container } = render(<Input variant={variant} placeholder="Type here" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("disabled", () => {
    const { container } = render(<Input disabled value="locked" readOnly />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("Label visual baseline", () => {
  it("default", () => {
    const { container } = render(<Label htmlFor="x">Email</Label>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("InputField / InputGroup visual baseline", () => {
  it("minimal", () => {
    const { container } = render(
      <InputGroup>
        <InputField label="Name">
          <Input />
        </InputField>
      </InputGroup>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("required with description and error", () => {
    const { container } = render(
      <InputField label="Amount" required description="In XLM" error="Must be positive">
        <Input variant="error" />
      </InputField>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
