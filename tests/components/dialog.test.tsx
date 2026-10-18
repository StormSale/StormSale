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
