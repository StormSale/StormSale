// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../src/components/ui/dialog";
import { Button } from "../../src/components/ui/button";
import { normalizeGeneratedIds } from "./snapshot-utils";

const snapshotBody = () => expect(normalizeGeneratedIds(document.body)).toMatchSnapshot();

describe("Dialog (modal) visual baseline", () => {
  it("open: title only", () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Modal title</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    snapshotBody();
  });

  it("open: header, description, body and footer", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm action</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <p>Body content</p>
          <DialogFooter>
            <Button variant="outline">Cancel</Button>
            <Button variant="destructive">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    snapshotBody();
  });

  it("open: custom className on content", () => {
    render(
      <Dialog open>
        <DialogContent className="max-w-sm">
          <DialogHeader className="items-center">
            <DialogTitle>Narrow modal</DialogTitle>
            <DialogDescription>Custom width.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    snapshotBody();
  });

  describe.each(["sm", "md", "lg", "xl", "full", "mobile-full"] as const)("size: %s", (size) => {
    it("open", () => {
      render(
        <Dialog open>
          <DialogContent size={size}>
            <DialogHeader>
              <DialogTitle>Sized modal</DialogTitle>
              <DialogDescription>Size variant {size}.</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>,
      );
      snapshotBody();
    });
  });

  it("open: animated disabled", () => {
    render(
      <Dialog open>
        <DialogContent animated={false}>
          <DialogHeader>
            <DialogTitle>Static modal</DialogTitle>
            <DialogDescription>Rendered without the entrance animation.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    snapshotBody();
  });

  it("open: close button hidden", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>No close button</DialogTitle>
            <DialogDescription>Dismiss via footer actions only.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    snapshotBody();
  });

  it("closed: renders nothing", () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Hidden</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    snapshotBody();
  });
});
