// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as Card from "../../src/components/ui/card";

describe("Card visual baseline", () => {
  it("full composition", () => {
    const { container } = render(
      <Card.Card>
        <Card.CardHeader>
          <Card.CardTitle>Title</Card.CardTitle>
          <Card.CardDescription>Description</Card.CardDescription>
        </Card.CardHeader>
        <Card.CardContent>Content</Card.CardContent>
        <Card.CardFooter>Footer</Card.CardFooter>
      </Card.Card>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("custom className", () => {
    const { container } = render(<Card.Card className="p-4">Plain</Card.Card>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
