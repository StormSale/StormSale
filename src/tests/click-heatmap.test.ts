import { describe, it, expect } from "vitest";
import {
  aggregateByCountry,
  getCountryCoords,
  projectToMap,
  rankCountries,
} from "../lib/geo";

describe("geo utils", () => {
  it("projects lat/lng into the SVG viewbox", () => {
    const topLeft = projectToMap(90, -180);
    expect(topLeft.x).beWithin(0, 0.00001);
    expect(topLeft.y).beWithin(0, 0.00001);

    const bottomRight = projectToMap(-90, 180);
    expect(bottomRight.x).beWithin(1000, 0.00001);
    expect(bottomRight.y).beWithin(500, 0.00001);
  });

  it("resolves country coordinates from ISO codes case-insensitively", () => {
    const us = getCountryCoords("us");
    expect(us).not.toBeNull();
    expect(us?.name).toBe("United States");
    expect(getCountryCoords("ZZ")).toBeNull();
  });

  it("aggregates clicks and conversions by country without raw PII", () => {
    const points = aggregateByCountry([
      { countryIso: "US", converted: true },
      { countryIso: "us", converted: false },
      { countryIso: "US", converted: true },
      { countryIso: "GB", converted: false },
      { countryIso: "XX", converted: true },
    ]);

    expect(points).toHaveLength(2);
    const us = points.find((p) => p.countryIso === "US");
    expect(us).toMatchObject({ clicks: 3, conversions: 2 });
    expect(us).not.toHaveProperty("ip");
  });

  it("ranks top countries with conversion percentage", () => {
    const ranked = rankCountries([
      { countryIso: "US", countryName: "United States", clicks: 10, conversions: 5 },
      { countryIso: "GB", countryName: "United Kingdom", clicks: 20, conversions: 2 },
      { countryIso: "DE", countryName: "Germany", clicks: 5, conversions: 0 },
    ]);

    expect(ranked[0].countryIso).toBe("GB");
    expect(ranked[0].conversionRate).beWithin(10, 0.00001);
    expect(ranked[1].conversionRate).beWithin(50, 0.00001);
    expect(ranked[2].conversionRate).toBe(0);
  });
});
