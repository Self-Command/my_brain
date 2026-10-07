import { describe, expect, it } from "vitest";

import {
  S13_SMOKE_PATHS,
  buildS13MockDeviceEvidence,
} from "../../tools/app-ui-execution/device-smoke-matrix";

describe("S13 runtime smoke matrix", () => {
  it("covers all required runtime path ids on Android and iOS", () => {
    const evidence = buildS13MockDeviceEvidence();
    expect(evidence).toHaveLength(S13_SMOKE_PATHS.length * 2);

    for (const platform of ["android", "ios"] as const) {
      const platformPaths = evidence
        .filter((item) => item.platform === platform)
        .map((item) => item.pathId)
        .sort();
      expect(platformPaths).toEqual([...S13_SMOKE_PATHS].sort());
    }
  });

  it("marks every generated device evidence item as mock-deferred, never real", () => {
    const evidence = buildS13MockDeviceEvidence();
    for (const item of evidence) {
      expect(item.source).toBe("mock");
      expect(item.result).toBe("NOT_RUN");
      expect(item.replaceWithRealDeviceEvidence).toBe(true);
      expect(item.artifactPaths[0]).toContain(`S13-${item.platform}-smoke`);
      expect(JSON.stringify(item).toLowerCase()).not.toContain('"source":"real"');
    }
  });
});
