import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEMO_GRAPH_FIXTURE,
  DEMO_MODE_META_KEY,
  MobileStorage,
  resetDemoStorage,
  type ResetDemoCoreOptions,
  type ResetDemoCoreResult,
} from "@my-brain/core";

import { createTestStorageSession } from "../storage/testStorageSession";

export type ResetDemoOptions = ResetDemoCoreOptions & {
  dbPath?: string;
};

export type ResetDemoResult = ResetDemoCoreResult & {
  dbPath: string;
};

/** Node/Vitest + CLI entry — wipes prior graph/profile/provisional, seeds labeled demo fixtures. */
export function resetDemo(options: ResetDemoOptions = {}): ResetDemoResult {
  let dbPath = options.dbPath;
  if (!dbPath) {
    const tempDir = mkdtempSync(join(tmpdir(), "mybrain-demo-reset-"));
    dbPath = join(tempDir, "mybrain.db");
  }

  const session = createTestStorageSession(dbPath);
  try {
    session.storage.migrate();
    const result = resetDemoStorage(session.storage, options);
    return { ...result, dbPath };
  } finally {
    session.driver.close?.();
  }
}

/** In-app dev path when storage session is already open. */
export function resetDemoOnSession(
  storage: MobileStorage,
  options?: ResetDemoCoreOptions,
): ResetDemoCoreResult {
  return resetDemoStorage(storage, options);
}

export function readDemoModeFromStorage(storage: MobileStorage): boolean {
  return storage.getMeta(DEMO_MODE_META_KEY) === "true";
}

export const DEMO_FIXTURE_NODE_COUNT = DEMO_GRAPH_FIXTURE.nodes.length;
