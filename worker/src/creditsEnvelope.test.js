import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCreditsEnvelope,
  conservativeBillFromEstimatedInput,
  estimateBundledInputTokens
} from "./creditsEnvelope.js";

describe("conservativeBillFromEstimatedInput", () => {
  it("matches 2.5x rule capped by daily limit and plan cap", () => {
    assert.equal(conservativeBillFromEstimatedInput(100, 1000), 250);
    assert.equal(conservativeBillFromEstimatedInput(400, 1000), 1000);
    assert.equal(conservativeBillFromEstimatedInput(5000, 50000), 12500);
  });
});

describe("estimateBundledInputTokens", () => {
  it("caps prompt and instruction lengths like /optimize", () => {
    const t = estimateBundledInputTokens(12000, 3000);
    assert.ok(t > 0);
    const t2 = estimateBundledInputTokens(4, 4);
    assert.equal(t2, 2);
  });
});

describe("buildCreditsEnvelope", () => {
  it("flags can_run_estimated_prompt false when budget too tight", () => {
    const env = buildCreditsEnvelope(
      { ok: true, limited: false, used: 850, remaining: 150, limit: 1000 },
      1000,
      { estimatedInputTokens: 100 }
    );
    assert.equal(env.remaining, 150);
    assert.equal(env.planned_bill_estimate, 250);
    assert.equal(env.can_run_estimated_prompt, false);
  });

  it("flags can_run_estimated_prompt true when enough headroom", () => {
    const env = buildCreditsEnvelope(
      { ok: true, limited: false, used: 100, remaining: 900, limit: 1000 },
      1000,
      { estimatedInputTokens: 100 }
    );
    assert.equal(env.can_run_estimated_prompt, true);
  });

  it("leaves can_run_estimated_prompt null without estimate", () => {
    const env = buildCreditsEnvelope(
      { ok: true, limited: false, used: 100, remaining: 900, limit: 1000 },
      1000,
      {}
    );
    assert.equal(env.can_run_estimated_prompt, null);
    assert.equal(env.planned_bill_estimate, null);
  });
});
