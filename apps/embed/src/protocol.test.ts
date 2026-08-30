import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_CHANNEL,
  PROTOCOL_VERSION,
  isTourMessage,
  isKnownProtocolVersion,
  isTrustedOrigin,
  makeMessage,
} from "./protocol.ts";

test("isTourMessage: accepts a well-formed message", () => {
  const msg = makeMessage("tour:hello", "tm1", { viewerVersion: "1.0.0" });
  assert.equal(isTourMessage(msg), true);
});

test("isTourMessage: rejects non-objects and null", () => {
  assert.equal(isTourMessage(null), false);
  assert.equal(isTourMessage(undefined), false);
  assert.equal(isTourMessage("tour:hello"), false);
  assert.equal(isTourMessage(42), false);
});

test("isTourMessage: rejects wrong channel (traffic from an unrelated embed/extension)", () => {
  assert.equal(
    isTourMessage({ channel: "some-other-widget", v: 1, instance: "tm1", type: "x", payload: {} }),
    false,
  );
});

test("isTourMessage: rejects missing/wrong-typed fields", () => {
  assert.equal(isTourMessage({ channel: PROTOCOL_CHANNEL }), false);
  assert.equal(
    isTourMessage({ channel: PROTOCOL_CHANNEL, v: "1", instance: "tm1", type: "x", payload: {} }),
    false,
  );
  assert.equal(
    isTourMessage({ channel: PROTOCOL_CHANNEL, v: 1, instance: 1, type: "x", payload: {} }),
    false,
  );
  assert.equal(
    isTourMessage({ channel: PROTOCOL_CHANNEL, v: 1, instance: "tm1", type: "x", payload: null }),
    false,
  );
});

test("isKnownProtocolVersion: only accepts the current version", () => {
  assert.equal(isKnownProtocolVersion(PROTOCOL_VERSION), true);
  assert.equal(isKnownProtocolVersion(999), false);
  assert.equal(isKnownProtocolVersion(0), false);
});

test("isTrustedOrigin: exact match only, immune to substring spoofing", () => {
  const expected = "https://viewer.tumarca.com";
  assert.equal(isTrustedOrigin(expected, expected), true);
  assert.equal(isTrustedOrigin("https://viewer.tumarca.com.evil.com", expected), false);
  assert.equal(isTrustedOrigin("https://evil.com/?https://viewer.tumarca.com", expected), false);
  assert.equal(isTrustedOrigin("http://viewer.tumarca.com", expected), false); // scheme must match
  assert.equal(isTrustedOrigin("https://viewer.tumarca.com:8443", expected), false); // port must match
});

test("makeMessage: stamps channel + protocol version + instance", () => {
  const msg = makeMessage("tour:resize", "tm2", { height: 480 });
  assert.equal(msg.channel, PROTOCOL_CHANNEL);
  assert.equal(msg.v, PROTOCOL_VERSION);
  assert.equal(msg.instance, "tm2");
  assert.equal(msg.type, "tour:resize");
  assert.deepEqual(msg.payload, { height: 480 });
});
