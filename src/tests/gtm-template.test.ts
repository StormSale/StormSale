// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const template = readFileSync(resolve(process.cwd(), "docs/integrations/gtm/template.tpl"), "utf8");

function section(name: string): string {
  const marker = `___${name}___`;
  const start = template.indexOf(marker);
  if (start === -1) throw new Error(`Missing ${marker}`);
  const contentStart = start + marker.length;
  const end = template.indexOf("___", contentStart);
  return template.slice(contentStart, end === -1 ? undefined : end).trim();
}

function runTemplate(dataOverrides: Record<string, unknown>) {
  const js = section("SANDBOXED_JS_FOR_WEB_TEMPLATE");
  const pushes: Array<Record<string, unknown>> = [];
  const result = { success: 0, failure: 0 };
  const sandbox: Record<string, (...args: never[]) => unknown> = {
    createQueue: ((name: string) => {
      expect(name).toBe("dataLayer");
      return (payload: Record<string, unknown>) => pushes.push(payload);
    }) as never,
    getType: ((value: unknown) => {
      if (value === null) return "null";
      if (Array.isArray(value)) return "array";
      return typeof value;
    }) as never,
    makeNumber: ((value: unknown) => {
      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    }) as never,
    makeString: ((value: unknown) => String(value)) as never,
  };

  const fn = new Function("require", "data", js) as (
    requireFn: (name: string) => unknown,
    data: Record<string, unknown>,
  ) => void;
  fn((name: string) => sandbox[name], {
    campaignId: "42",
    orderValue: "99.5",
    currency: "usd",
    eventName: "stormsale_conversion",
    gtmOnSuccess: () => {
      result.success += 1;
    },
    gtmOnFailure: () => {
      result.failure += 1;
    },
    ...dataOverrides,
  });
  return { pushes, result };
}

describe("Google Tag Manager Community Template (#197)", () => {
  it("imports with valid info, parameters and sandbox permissions", () => {
    const info = JSON.parse(section("INFO"));
    expect(info).toMatchObject({
      type: "TAG",
      version: 1,
      securityGroups: [],
      containerContexts: ["WEB"],
    });
    expect(info.displayName).toBe("StormSale Conversion Tracking");
    expect(info.brand).toMatchObject({ displayName: "StormSale" });

    const params = JSON.parse(section("TEMPLATE_PARAMETERS"));
    const byName = Object.fromEntries(params.map((param: { name: string }) => [param.name, param]));
    expect(byName.campaignId).toMatchObject({ type: "TEXT" });
    expect(byName.campaignId.valueValidators).toEqual([{ type: "NON_EMPTY" }]);
    expect(byName.orderValue).toMatchObject({
      type: "TEXT",
      displayName: "Order Value Variable",
    });
    expect(byName.orderValue.valueValidators).toEqual([{ type: "NON_EMPTY" }]);
    expect(byName.currency).toMatchObject({ type: "SELECT", defaultValue: "USD" });
    expect(byName.currency.selectItems.map((item: { value: string }) => item.value)).toEqual(
      expect.arrayContaining(["USD", "EUR", "GBP", "XLM", "USDC"]),
    );

    expect(JSON.parse(section("WEB_PERMISSIONS"))).toEqual([]);

    const js = section("SANDBOXED_JS_FOR_WEB_TEMPLATE");
    expect(js).not.toMatch(/\bdocument\b|\bwindow\b|eval\(|injectScript|sendPixel/);
    expect(js).toContain("createQueue('dataLayer')");
    expect(js).toContain("gtmOnSuccess");
    expect(js).toContain("gtmOnFailure");
  });

  it("pushes a normalized conversion to the data layer", () => {
    const { pushes, result } = runTemplate({});
    expect(result).toEqual({ success: 1, failure: 0 });
    expect(pushes).toEqual([
      {
        event: "stormsale_conversion",
        stormsale: {
          campaign_id: "42",
          order_value: 99.5,
          currency: "USD",
        },
      },
    ]);
  });

  it("accepts numeric order values and a custom event name", () => {
    const { pushes, result } = runTemplate({ orderValue: 250, eventName: "purchase" });
    expect(result).toEqual({ success: 1, failure: 0 });
    expect(pushes[0]).toMatchObject({
      event: "purchase",
      stormsale: { order_value: 250, currency: "USD" },
    });
  });

  it("fails without pushing when the campaign or order value is invalid", () => {
    const missingCampaign = runTemplate({ campaignId: "" });
    expect(missingCampaign.result).toEqual({ success: 0, failure: 1 });
    expect(missingCampaign.pushes).toEqual([]);

    const invalidValue = runTemplate({ orderValue: "not-a-number" });
    expect(invalidValue.result).toEqual({ success: 0, failure: 1 });
    expect(invalidValue.pushes).toEqual([]);

    const zeroValue = runTemplate({ orderValue: 0 });
    expect(zeroValue.result).toEqual({ success: 0, failure: 1 });
  });

  it("documents Purchase and Custom Event trigger usage", () => {
    const readme = readFileSync(resolve(process.cwd(), "docs/integrations/gtm/README.md"), "utf8");
    expect(readme).toContain("Purchase");
    expect(readme).toContain("Custom Event");
    expect(readme).toContain("template.tpl");
    expect(readme).toContain("stormsale_conversion");
  });
});
