import { describe, expect, it } from "vitest";
import * as api from "../src/index";

// All other suites import from ../src/<module> directly, so a line dropped
// from the barrel would ship a broken public API with a green suite.
describe("public export surface", () => {
  it("exposes every documented function", () => {
    expect(api.auditProcesses).toBeTypeOf("function");
    expect(api.cleanupTempFiles).toBeTypeOf("function");
    expect(api.clearCacheOnUpdate).toBeTypeOf("function");
    expect(api.createStartupTimer).toBeTypeOf("function");
    expect(api.managePowerState).toBeTypeOf("function");
    expect(api.validateWindowBounds).toBeTypeOf("function");
  });
});
