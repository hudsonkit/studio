import { describe, expect, test } from "bun:test";
import { describePresence, formatAge } from "../src/feedback/presence";
import type { AgentPresence } from "../src/feedback/types";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const agent = (overrides: Partial<AgentPresence>): AgentPresence => ({
  session: "s1",
  name: "atlas",
  listening: false,
  slugs: null,
  lastSeenAt: ago(0),
  lastWaitTimedOut: false,
  ...overrides,
});

describe("describePresence", () => {
  test("listening while blocked in a wait", () => {
    expect(describePresence(agent({ listening: true, lastSeenAt: ago(600_000) }), NOW).state).toBe("listening");
  });

  test("still listening in the gap after a timed-out wait", () => {
    const between = agent({ lastWaitTimedOut: true, lastWaitEndedAt: ago(5_000), lastSeenAt: ago(5_000) });
    expect(describePresence(between, NOW).label).toBe("listening");
  });

  test("working after a wait that returned feedback", () => {
    const acting = agent({ lastWaitTimedOut: false, lastWaitEndedAt: ago(5_000), lastSeenAt: ago(5_000) });
    expect(describePresence(acting, NOW).state).toBe("working");
  });

  test("idle with an age once quiet", () => {
    expect(describePresence(agent({ lastSeenAt: ago(12 * 60_000) }), NOW).label).toBe("idle 12m");
    expect(formatAge(3 * 3_600_000)).toBe("3h");
    expect(formatAge(50 * 3_600_000)).toBe("2d");
  });
});
