import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAspect,
  aspectToPaddingTopPercent,
  parseTourDataset,
  ConfigError,
  buildDeepLinkPrefix,
  readDeepLinkParams,
  writeDeepLinkParams,
  buildIframeSrc,
} from "./config.ts";

test("parseAspect: parses slash and colon separators", () => {
  assert.deepEqual(parseAspect("16/9"), { w: 16, h: 9 });
  assert.deepEqual(parseAspect("4:3"), { w: 4, h: 3 });
  assert.deepEqual(parseAspect(" 1 / 1 "), { w: 1, h: 1 });
});

test("parseAspect: falls back to 16/9 for missing/malformed input", () => {
  assert.deepEqual(parseAspect(undefined), { w: 16, h: 9 });
  assert.deepEqual(parseAspect(null), { w: 16, h: 9 });
  assert.deepEqual(parseAspect(""), { w: 16, h: 9 });
  assert.deepEqual(parseAspect("garbage"), { w: 16, h: 9 });
  assert.deepEqual(parseAspect("0/9"), { w: 16, h: 9 });
  assert.deepEqual(parseAspect("-16/9"), { w: 16, h: 9 });
});

test("aspectToPaddingTopPercent computes height/width * 100", () => {
  assert.equal(aspectToPaddingTopPercent({ w: 16, h: 9 }), 56.25);
  assert.equal(aspectToPaddingTopPercent({ w: 1, h: 1 }), 100);
});

test("parseTourDataset: requires tenant and project", () => {
  assert.throws(() => parseTourDataset({}), ConfigError);
  assert.throws(() => parseTourDataset({ tenant: "dacal" }), ConfigError);
  assert.throws(() => parseTourDataset({ project: "baleia" }), ConfigError);
});

test("parseTourDataset: normalizes optional fields and defaults aspect", () => {
  const result = parseTourDataset({ tenant: " dacal ", project: "baleia" });
  assert.equal(result.tenant, "dacal");
  assert.equal(result.project, "baleia");
  assert.equal(result.poster, null);
  assert.equal(result.unit, null);
  assert.equal(result.scene, null);
  assert.deepEqual(result.aspect, { w: 16, h: 9 });
});

test("parseTourDataset: carries through poster/unit/scene/aspect", () => {
  const result = parseTourDataset({
    tenant: "dacal",
    project: "baleia",
    poster: "https://cdn.example.com/poster.jpg",
    unit: "B2-A",
    scene: "lobby",
    aspect: "4/3",
  });
  assert.equal(result.poster, "https://cdn.example.com/poster.jpg");
  assert.equal(result.unit, "B2-A");
  assert.equal(result.scene, "lobby");
  assert.deepEqual(result.aspect, { w: 4, h: 3 });
});

test("buildDeepLinkPrefix: no prefix for a single tour, indexed prefix for multiple", () => {
  assert.equal(buildDeepLinkPrefix(0, 1), "");
  assert.equal(buildDeepLinkPrefix(0, 2), "t1_");
  assert.equal(buildDeepLinkPrefix(1, 2), "t2_");
});

test("readDeepLinkParams: reads prefixed and unprefixed params", () => {
  assert.deepEqual(readDeepLinkParams("?tm_unit=B2-A&tm_scene=lobby", ""), {
    unit: "B2-A",
    scene: "lobby",
  });
  assert.deepEqual(readDeepLinkParams("?t1_tm_unit=B2-A&t2_tm_unit=C4-B", "t2_"), {
    unit: "C4-B",
    scene: null,
  });
});

test("writeDeepLinkParams: sets, updates, and clears without touching other params", () => {
  const search = writeDeepLinkParams("?utm_source=fb", "", { unit: "B2-A" });
  assert.equal(search, "?utm_source=fb&tm_unit=B2-A");

  const cleared = writeDeepLinkParams("?tm_unit=B2-A&other=1", "", { unit: null });
  assert.equal(cleared, "?other=1");

  const multi = writeDeepLinkParams("?t1_tm_unit=A&t2_tm_unit=B", "t1_", { unit: "Z" });
  assert.equal(multi, "?t1_tm_unit=Z&t2_tm_unit=B");
});

test("buildIframeSrc: bakes tenant/project/unit/scene into the query string, preferring deep link over static config", () => {
  const config = {
    tenant: "dacal",
    project: "baleia",
    poster: null,
    unit: "B2-A",
    scene: null,
    aspect: { w: 16, h: 9 },
  };
  const src = buildIframeSrc(
    "https://viewer.tumarca.com",
    config,
    { unit: "C4-B", scene: "pool" },
    "tm1",
    "https://dacal.com.uy",
  );
  const url = new URL(src);
  assert.equal(url.origin, "https://viewer.tumarca.com");
  assert.equal(url.searchParams.get("instance"), "tm1");
  assert.equal(url.searchParams.get("tenant"), "dacal");
  assert.equal(url.searchParams.get("project"), "baleia");
  // deep link (from the mother page URL) wins over the element's static data-unit
  assert.equal(url.searchParams.get("unit"), "C4-B");
  assert.equal(url.searchParams.get("scene"), "pool");
});

test("buildIframeSrc: bakes the embedding page's origin as ?parentOrigin=, so the viewer doesn't have to rely on document.referrer", () => {
  const config = {
    tenant: "dacal",
    project: "baleia",
    poster: null,
    unit: null,
    scene: null,
    aspect: { w: 16, h: 9 },
  };
  const src = buildIframeSrc(
    "https://viewer.tumarca.com",
    config,
    { unit: null, scene: null },
    "tm1",
    "https://www.cliente.com",
  );
  const url = new URL(src);
  assert.equal(url.searchParams.get("parentOrigin"), "https://www.cliente.com");
});
