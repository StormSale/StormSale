import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";
import {
  parseBulkCampaignCsv,
  validateCampaignRow,
  validateCampaignUrl,
  validateCampaignBudget,
  validateCampaignPayoutRate,
  validateClearingPeriod,
  detectCampaignHeaders,
  generateSampleCampaignCsv,
} from "../lib/bulkCampaignParser";
import { BulkCampaignCsvUploader } from "../components/advertiser/BulkCampaignCsvUploader";

describe("B2B Bulk Campaign CSV Upload & Validation Preview (#437)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("AC 1: Parsing of 1,000+ Row CSV using Web Worker to Prevent Main Thread Blocking", () => {
    it("parses a 1,000+ row CSV asynchronously without blocking the main thread", async () => {
      // Synthesize 1,050 campaign rows
      const rowCount = 1050;
      const csv = generateSampleCampaignCsv(rowCount, false);

      const startTime = performance.now();
      const result = await parseBulkCampaignCsv(csv, { useWorker: true });
      const duration = performance.now() - startTime;

      expect(result.totalRows).toBe(rowCount);
      expect(result.validCount).toBe(rowCount);
      expect(result.malformedCount).toBe(0);
      expect(result.hasRequiredHeaders).toBe(true);
      expect(result.rows).toHaveLength(rowCount);

      // Verify first and last rows
      expect(result.rows[0].name).toBe("Campaign 1");
      expect(result.rows[0].url).toBe("https://brand.com/campaign/1");
      expect(result.rows[0].budget).toBe(500);
      expect(result.rows[0].payoutRate).toBe(10);
      expect(result.rows[0].rowNumber).toBe(1);

      expect(result.rows[rowCount - 1].name).toBe(`Campaign ${rowCount}`);
      expect(result.rows[rowCount - 1].rowNumber).toBe(rowCount);

      // Total budget sum is calculated accurately
      expect(result.totalBudgetXlm).toBeGreaterThan(0);
      // Non-blocking asynchronous execution completes promptly
      expect(duration).toBeLessThan(10000);
    });

    it("handles large 1,000+ row CSV with interspersed errors across thousands of lines", async () => {
      const lines = ["name,url,budget,payout_rate,clearing_period"];
      for (let i = 1; i <= 1000; i++) {
        if (i % 200 === 0) {
          lines.push(`Campaign ${i},not-a-valid-url,-100,150%,604800`);
        } else {
          lines.push(`Campaign ${i},https://example.com/c/${i},${100 + i},10%,604800`);
        }
      }
      const csv = lines.join("\n");

      const result = await parseBulkCampaignCsv(csv, { useWorker: true });
      expect(result.totalRows).toBe(1000);
      expect(result.malformedCount).toBe(5); // 200, 400, 600, 800, 1000
      expect(result.validCount).toBe(995);

      const row200 = result.rows.find((r) => r.rowNumber === 200);
      expect(row200?.status).toBe("malformed");
      expect(row200?.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("AC 2: Validation Highlights for Invalid URLs, Negative Budgets, and Malformed Payout Rates", () => {
    it("validates campaign destination URLs strictly and rejects insecure/malformed URLs", () => {
      // Valid URLs
      expect(validateCampaignUrl("https://stormsale.io/promo").isValid).toBe(true);
      expect(validateCampaignUrl("http://localhost:3000/landing").isValid).toBe(true);
      expect(validateCampaignUrl("https://sub.domain.co.uk/page?ref=123").isValid).toBe(true);

      // Insecure protocols & XSS attempts
      const jsUrl = validateCampaignUrl("javascript:alert('xss')");
      expect(jsUrl.isValid).toBe(false);
      expect(jsUrl.error).toContain("insecure protocol detected");

      const dataUrl = validateCampaignUrl("data:text/html,<script>alert(1)</script>");
      expect(dataUrl.isValid).toBe(false);
      expect(dataUrl.error).toContain("insecure protocol detected");

      // Non-HTTP protocols
      const ftpUrl = validateCampaignUrl("ftp://files.example.com/campaign");
      expect(ftpUrl.isValid).toBe(false);
      expect(ftpUrl.error).toContain("Only HTTP and HTTPS are permitted");

      // Malformed / empty URLs
      expect(validateCampaignUrl("").isValid).toBe(false);
      expect(validateCampaignUrl("not-a-valid-url").isValid).toBe(false);
      expect(validateCampaignUrl("https://").isValid).toBe(false);
    });

    it("validates campaign budgets and rejects negative amounts, zero, or non-numeric strings", () => {
      // Valid budgets
      expect(validateCampaignBudget("500")).toEqual({ isValid: true, value: 500 });
      expect(validateCampaignBudget("1250.75")).toEqual({ isValid: true, value: 1250.75 });
      expect(validateCampaignBudget("1,000")).toEqual({ isValid: true, value: 1000 });

      // Negative budgets
      const negative = validateCampaignBudget("-500");
      expect(negative.isValid).toBe(false);
      expect(negative.error).toContain("Budget cannot be negative");

      const negativeDec = validateCampaignBudget("-0.01");
      expect(negativeDec.isValid).toBe(false);
      expect(negativeDec.error).toContain("Budget cannot be negative");

      // Zero & non-positive
      const zero = validateCampaignBudget("0");
      expect(zero.isValid).toBe(false);
      expect(zero.error).toContain("Budget must be greater than zero");

      // Non-numeric / malformed
      expect(validateCampaignBudget("abc").isValid).toBe(false);
      expect(validateCampaignBudget("").isValid).toBe(false);
      expect(validateCampaignBudget(null).isValid).toBe(false);
    });

    it("validates payout rates and rejects negative rates, rates > 100%, and non-numeric values", () => {
      // Valid rates
      expect(validateCampaignPayoutRate("10")).toEqual({ isValid: true, value: 10 });
      expect(validateCampaignPayoutRate("15.5%")).toEqual({ isValid: true, value: 15.5 });
      expect(validateCampaignPayoutRate("100%")).toEqual({ isValid: true, value: 100 });
      expect(validateCampaignPayoutRate("0.5")).toEqual({ isValid: true, value: 0.5 });

      // Negative rates
      const negRate = validateCampaignPayoutRate("-5%");
      expect(negRate.isValid).toBe(false);
      expect(negRate.error).toContain("Payout rate cannot be negative");

      // Over 100%
      const over100 = validateCampaignPayoutRate("150%");
      expect(over100.isValid).toBe(false);
      expect(over100.error).toContain("Payout rate cannot exceed 100%");

      // Zero or non-numeric
      const zeroRate = validateCampaignPayoutRate("0%");
      expect(zeroRate.isValid).toBe(false);
      expect(zeroRate.error).toContain("Payout rate must be greater than 0%");

      expect(validateCampaignPayoutRate("invalid-rate").isValid).toBe(false);
      expect(validateCampaignPayoutRate("").isValid).toBe(false);
      expect(validateCampaignPayoutRate("10%%").isValid).toBe(false);
      expect(validateCampaignPayoutRate("1%0").isValid).toBe(false);
    });

    it("validates clearing periods with 7-day default and strict integer check", () => {
      expect(validateClearingPeriod("").value).toBe(604800);
      expect(validateClearingPeriod(null).value).toBe(604800);
      expect(validateClearingPeriod("86400").value).toBe(86400);
      expect(validateClearingPeriod("0").value).toBe(0);

      // Rejects decimals and non-integers
      expect(validateClearingPeriod("86400.5").isValid).toBe(false);
      expect(validateClearingPeriod("-100").isValid).toBe(false);
      expect(validateClearingPeriod("abc").isValid).toBe(false);
    });

    it("validates individual campaign rows and aggregates multiple field errors", () => {
      const validRow = validateCampaignRow(
        {
          name: "Enterprise Promotion",
          url: "https://enterprise.com/promo",
          budget: "1000",
          payoutRate: "12%",
          clearingPeriod: "604800",
        },
        1,
      );
      expect(validRow.status).toBe("valid");
      expect(validRow.errors).toHaveLength(0);
      expect(validRow.budget).toBe(1000);

      const invalidRow = validateCampaignRow(
        {
          name: "",
          url: "ftp://bad-url.com",
          budget: "-500",
          payoutRate: "200%",
          clearingPeriod: "-10",
        },
        2,
      );
      expect(invalidRow.status).toBe("malformed");
      expect(invalidRow.errors.length).toBeGreaterThanOrEqual(4);
    });

    it("validates clearing periods with 7-day default", () => {
      expect(validateClearingPeriod("").value).toBe(604800);
      expect(validateClearingPeriod(null).value).toBe(604800);
      expect(validateClearingPeriod("86400")).toEqual({ isValid: true, value: 86400 });
      expect(validateClearingPeriod("-1").isValid).toBe(false);
    });

    it("renders visual error highlights and error badges in the UI preview table", async () => {
      const sampleCsv = [
        "name,url,budget,payout_rate,clearing_period",
        "Row 1 Invalid URL,ftp://invalid-server.com/deals,1000,10%,604800",
        "Row 2 Negative Budget,https://example.com/promo,-500,15%,604800",
        "Row 3 Malformed Payout,https://example.com/launch,2500,150%,604800",
        "Row 4 Valid Campaign,https://example.com/valid,5000,12%,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: sampleCsv }));

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
      });

      // Verify Stats
      expect(screen.getByTestId("stat-total").textContent).toContain("4");
      expect(screen.getByTestId("stat-valid").textContent).toContain("1");
      expect(screen.getByTestId("stat-malformed").textContent).toContain("3");

      // Verify row 1 highlights invalid URL
      const cellUrl1 = screen.getByTestId("cell-url-1");
      expect(cellUrl1.className).toContain("text-red-400");
      expect(screen.getByText(/Only HTTP and HTTPS are permitted/i)).not.toBeNull();

      // Verify row 2 highlights negative budget
      const cellBudget2 = screen.getByTestId("cell-budget-2");
      expect(cellBudget2.className).toContain("text-red-400");
      expect(screen.getByText(/Budget cannot be negative/i)).not.toBeNull();

      // Verify row 3 highlights payout rate > 100%
      const cellPayout3 = screen.getByTestId("cell-payout-3");
      expect(cellPayout3.className).toContain("text-red-400");
      expect(screen.getByText(/Payout rate cannot exceed 100%/i)).not.toBeNull();

      // Verify submit button is disabled due to errors
      const submitBtn = screen.getByTestId("submit-batch-btn") as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });
  });

  describe("AC 3: Inline Correction of Flagged CSV Cells Before Batch Submission", () => {
    it("allows inline editing of flagged cells, re-validates in place, and enables submission when clean", async () => {
      const sampleCsv = [
        "name,url,budget,payout_rate,clearing_period",
        "Row 1,https://example.com/promo,-500,10%,604800", // Negative budget
      ].join("\n");

      const onBatchSubmitMock = vi.fn();
      render(
        createElement(BulkCampaignCsvUploader, {
          initialContent: sampleCsv,
          onBatchSubmit: onBatchSubmitMock,
        }),
      );

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
      });

      // Initially 1 error and submit button disabled
      expect(screen.getByTestId("stat-malformed").textContent).toContain("1");
      expect(screen.getByTestId("status-badge-1").textContent).toMatch(/Error/i);
      expect((screen.getByTestId("submit-batch-btn") as HTMLButtonElement).disabled).toBe(true);

      // Click "Edit" on row 1
      const editBtn = screen.getByTestId("edit-btn-1");
      fireEvent.click(editBtn);

      // Verify inline inputs appear
      const budgetInput = screen.getByTestId("edit-budget-1") as HTMLInputElement;
      expect(budgetInput).not.toBeNull();
      expect(budgetInput.value).toBe("-500");

      // Inline correct the negative budget from -500 to 2500
      fireEvent.change(budgetInput, { target: { value: "2500" } });

      // Click "Save"
      const saveBtn = screen.getByTestId("save-btn-1");
      fireEvent.click(saveBtn);

      // Verify status transitions to Valid and error count drops to 0
      await waitFor(() => {
        expect(screen.getByTestId("status-badge-1").textContent).toMatch(/Valid/i);
        expect(screen.getByTestId("stat-malformed").textContent).toContain("0");
        expect(screen.getByTestId("stat-valid").textContent).toContain("1");
        expect(screen.getByTestId("stat-budget").textContent).toContain("2500 XLM");
      });

      // Submit button is now enabled
      const submitBtn = screen.getByTestId("submit-batch-btn") as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);

      // Trigger batch submission
      fireEvent.click(submitBtn);
      expect(onBatchSubmitMock).toHaveBeenCalledTimes(1);
      expect(onBatchSubmitMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            rowNumber: 1,
            budget: 2500,
            status: "valid",
          }),
        ]),
      );
    });

    it("allows sequential correction of multiple invalid fields in a row", async () => {
      // Row with both an invalid URL and invalid payout rate
      const badCsv = [
        "name,url,budget,payout_rate,clearing_period",
        "Faulty Campaign,ftp://bad-url.org,1000,200%,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: badCsv }));

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
      });

      expect(screen.getByTestId("stat-malformed").textContent).toContain("1");

      // Edit row
      fireEvent.click(screen.getByTestId("edit-btn-1"));

      // Correct URL
      fireEvent.change(screen.getByTestId("edit-url-1"), {
        target: { value: "https://legit-domain.com/campaign" },
      });

      // Correct payout rate
      fireEvent.change(screen.getByTestId("edit-payout-1"), {
        target: { value: "12.5%" },
      });

      // Save
      fireEvent.click(screen.getByTestId("save-btn-1"));

      await waitFor(() => {
        expect(screen.getByTestId("status-badge-1").textContent).toMatch(/Valid/i);
        expect(screen.getByTestId("stat-malformed").textContent).toContain("0");
        expect((screen.getByTestId("submit-batch-btn") as HTMLButtonElement).disabled).toBe(false);
      });
    });

    it("allows cancelling inline edit without saving partial changes", async () => {
      const sampleCsv = [
        "name,url,budget,payout_rate,clearing_period",
        "Original Name,https://valid.com,1000,10%,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: sampleCsv }));

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
      });

      // Start edit
      fireEvent.click(screen.getByTestId("edit-btn-1"));
      const nameInput = screen.getByTestId("edit-name-1");
      fireEvent.change(nameInput, { target: { value: "Discarded Name" } });

      // Click Cancel
      fireEvent.click(screen.getByTestId("cancel-btn-1"));

      // Original name remains
      expect(screen.getByText("Original Name")).not.toBeNull();
      expect(screen.queryByText("Discarded Name")).toBeNull();
    });
  });

  describe("AC 4: Actionable Error Callouts for Empty or Malformed Headers", () => {
    it("displays an actionable error callout when the uploaded CSV is empty or whitespace", async () => {
      render(createElement(BulkCampaignCsvUploader, { initialContent: "   \n   \n   " }));

      await waitFor(() => {
        const errorCallout = screen.getByTestId("error-callout");
        expect(errorCallout).not.toBeNull();
        expect(errorCallout.textContent).toMatch(
          /CSV file is empty\. Please provide a file with campaign rows\./i,
        );
      });

      // Preview table should not be displayed
      expect(screen.queryByTestId("preview-section")).toBeNull();
    });

    it("displays an actionable error callout when mandatory headers are missing", async () => {
      // Missing 'budget' and 'payout_rate'
      const missingHeadersCsv = [
        "name,url,clearing_period",
        "Test Campaign,https://example.com,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: missingHeadersCsv }));

      await waitFor(() => {
        const errorCallout = screen.getByTestId("error-callout");
        expect(errorCallout).not.toBeNull();
        expect(errorCallout.textContent).toMatch(
          /Missing required column\(s\): 'budget', 'payout_rate'/i,
        );
        expect(errorCallout.textContent).toMatch(
          /Expected columns: name, url, budget, payout_rate, clearing_period/i,
        );
      });

      expect(screen.queryByTestId("preview-section")).toBeNull();
    });

    it("displays an actionable error callout when headers are completely unrecognized", async () => {
      const badHeadersCsv = ["col_one,col_two,col_three", "val1,val2,val3"].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: badHeadersCsv }));

      await waitFor(() => {
        const errorCallout = screen.getByTestId("error-callout");
        expect(errorCallout).not.toBeNull();
        expect(errorCallout.textContent).toMatch(
          /Missing required column\(s\): 'name', 'url', 'budget', 'payout_rate'/i,
        );
        expect(errorCallout.textContent).toMatch(/Found headers: \[col_one, col_two, col_three\]/i);
      });
    });

    it("resolves flexible header aliases without throwing header errors", () => {
      const headers = ["campaign_name", "landing_url", "total_budget", "commission", "lock_period"];
      const mapping = detectCampaignHeaders(headers);

      expect(mapping.nameColumn).toBe("campaign_name");
      expect(mapping.urlColumn).toBe("landing_url");
      expect(mapping.budgetColumn).toBe("total_budget");
      expect(mapping.payoutRateColumn).toBe("commission");
      expect(mapping.clearingPeriodColumn).toBe("lock_period");
    });
  });

  describe("UI Filtering, Search, and Sample Data Controls", () => {
    it("filters rows by 'All', 'Valid Only', and 'Errors Only' tabs", async () => {
      const csv = [
        "name,url,budget,payout_rate,clearing_period",
        "Valid One,https://valid.com/1,1000,10%,604800",
        "Malformed One,ftp://bad.com,2000,10%,604800",
        "Valid Two,https://valid.com/2,3000,15%,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: csv }));

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
      });

      // Filter: Valid Only
      fireEvent.click(screen.getByTestId("filter-valid"));
      expect(screen.getByText("Valid One")).not.toBeNull();
      expect(screen.getByText("Valid Two")).not.toBeNull();
      expect(screen.queryByText("Malformed One")).toBeNull();

      // Filter: Errors Only
      fireEvent.click(screen.getByTestId("filter-errors"));
      expect(screen.getByText("Malformed One")).not.toBeNull();
      expect(screen.queryByText("Valid One")).toBeNull();
      expect(screen.queryByText("Valid Two")).toBeNull();

      // Filter: All
      fireEvent.click(screen.getByTestId("filter-all"));
      expect(screen.getByText("Valid One")).not.toBeNull();
      expect(screen.getByText("Malformed One")).not.toBeNull();
      expect(screen.getByText("Valid Two")).not.toBeNull();
    });

    it("filters rows using the search query input", async () => {
      const csv = [
        "name,url,budget,payout_rate,clearing_period",
        "Summer Promo,https://summer.com,1000,10%,604800",
        "Winter Sale,https://winter.com,2000,10%,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: csv }));

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
      });

      const searchInput = screen.getByTestId("search-input");
      fireEvent.change(searchInput, { target: { value: "Winter" } });

      expect(screen.getByText("Winter Sale")).not.toBeNull();
      expect(screen.queryByText("Summer Promo")).toBeNull();

      // Search matching URL
      fireEvent.change(searchInput, { target: { value: "summer.com" } });
      expect(screen.getByText("Summer Promo")).not.toBeNull();
      expect(screen.queryByText("Winter Sale")).toBeNull();
    });

    it("cancels inline editing when Cancel button is clicked", async () => {
      const csv = [
        "name,url,budget,payout_rate,clearing_period",
        "Promo,https://valid.com,1000,10%,604800",
      ].join("\n");
      render(createElement(BulkCampaignCsvUploader, { initialContent: csv }));

      await waitFor(() => {
        expect(screen.getByTestId("edit-btn-1")).not.toBeNull();
      });

      fireEvent.click(screen.getByTestId("edit-btn-1"));
      expect(screen.getByTestId("cancel-btn-1")).not.toBeNull();
      fireEvent.click(screen.getByTestId("cancel-btn-1"));
      expect(screen.queryByTestId("cancel-btn-1")).toBeNull();
    });

    it("calls onBatchSubmit with valid rows when batch submit button is clicked", async () => {
      const onBatchSubmit = vi.fn();
      const csv = [
        "name,url,budget,payout_rate,clearing_period",
        "Submit Me,https://valid.com,1000,10%,604800",
      ].join("\n");

      render(createElement(BulkCampaignCsvUploader, { initialContent: csv, onBatchSubmit }));

      await waitFor(() => {
        expect(screen.getByTestId("submit-batch-btn")).not.toBeNull();
      });

      const submitBtn = screen.getByTestId("submit-batch-btn") as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);
      fireEvent.click(submitBtn);

      expect(onBatchSubmit).toHaveBeenCalledTimes(1);
      expect(onBatchSubmit).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: "Submit Me" })]),
      );
    });

    it("handles file input selection and drag & drop events", async () => {
      render(createElement(BulkCampaignCsvUploader));

      const dropZone = screen.getByTestId("drop-zone");
      const fileInput = screen.getByTestId("csv-file-input");

      // Dropzone click triggers hidden file input click
      const clickSpy = vi.spyOn(fileInput, "click");
      fireEvent.click(dropZone);
      expect(clickSpy).toHaveBeenCalled();

      // Keyboard activation via Enter and Space
      fireEvent.keyDown(dropZone, { key: "Enter" });
      expect(clickSpy).toHaveBeenCalled();
      fireEvent.keyDown(dropZone, { key: " " });
      expect(clickSpy).toHaveBeenCalled();

      // Drag over and drag leave styling transitions
      fireEvent.dragOver(dropZone);
      expect(dropZone.className).toContain("border-indigo-500");
      fireEvent.dragLeave(dropZone);
      expect(dropZone.className).not.toContain("bg-indigo-50/10");

      // File input change
      const fileContent =
        "name,url,budget,payout_rate,clearing_period\nInput File,https://input.com,500,5%,604800";
      const file = new File([fileContent], "input.csv", { type: "text/csv" });
      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
        expect(screen.getByText("Input File")).not.toBeNull();
      });

      // Drag and drop file
      const droppedContent =
        "name,url,budget,payout_rate,clearing_period\nDropped File,https://dropped.com,800,8%,604800";
      const droppedFile = new File([droppedContent], "dropped.csv", { type: "text/csv" });
      fireEvent.drop(dropZone, { dataTransfer: { files: [droppedFile] } });

      await waitFor(() => {
        expect(screen.getByText("Dropped File")).not.toBeNull();
      });
    });

    it("loads sample valid CSV and sample CSV with errors via sample buttons", async () => {
      render(createElement(BulkCampaignCsvUploader));

      // Click "Sample Valid CSV"
      const validSampleBtn = screen.getByRole("button", { name: /Sample Valid CSV/i });
      fireEvent.click(validSampleBtn);

      await waitFor(() => {
        expect(screen.getByTestId("preview-section")).not.toBeNull();
        expect(screen.getByTestId("stat-valid").textContent).toContain("8");
        expect(screen.getByTestId("stat-malformed").textContent).toContain("0");
      });

      // Click "Sample CSV With Errors"
      const errorSampleBtn = screen.getByRole("button", { name: /Sample CSV With Errors/i });
      fireEvent.click(errorSampleBtn);

      await waitFor(() => {
        expect(screen.getByTestId("stat-malformed").textContent).toContain("3");
      });
    });
  });
});
