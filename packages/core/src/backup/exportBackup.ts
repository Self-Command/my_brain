import type { GraphSnapshot } from "../graph/types.js";
import type { MobilePersistedBundle, MobileStorage } from "../storage/mobileStorage.js";
import { STORAGE_SCHEMA_VERSION } from "../storage/schema.js";
import { IngestGateViolation, MalformedBackupJsonError } from "./errors.js";
import { buildBackupManifest } from "./manifest.js";
import type {
  BackupExportOptions,
  BackupSnapshotPayload,
  UserModeProfileBackup,
} from "./types.js";

/** Export refuses to backfill missing ingest metadata on active permanent nodes. */
export function assertGraphExportIngestGate(snapshot: GraphSnapshot): void {
  for (const node of snapshot.nodes) {
    if (node.archived) {
      continue;
    }
    if (!node.confirmedAt && !node.ingestSource) {
      throw new IngestGateViolation(
        `Graph node ${node.id} missing confirmedAt/ingestSource — export refuses silent backfill`,
      );
    }
  }
}

function stripSensitiveProfileFields(
  profileBackup: UserModeProfileBackup,
  optIn: boolean,
): UserModeProfileBackup {
  if (optIn || !profileBackup.profile) {
    return profileBackup;
  }
  const { recentIntent: _removed, ...rest } = profileBackup.profile;
  return {
    ...profileBackup,
    profile: { ...rest },
  };
}

export function exportBackupSnapshotFromBundle(
  bundle: MobilePersistedBundle,
  options: BackupExportOptions = {},
): BackupSnapshotPayload {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const sensitiveProfileOptIn = options.sensitiveProfileOptIn ?? false;
  const profileBackup = stripSensitiveProfileFields(
    {
      profile: bundle.profile,
      coldStartComplete: bundle.coldStartComplete,
    },
    sensitiveProfileOptIn,
  );

  return {
    manifest: buildBackupManifest({
      exportedAt,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      sensitiveProfileOptIn,
    }),
    graph_snapshot: (() => {
      assertGraphExportIngestGate(bundle.graph);
      return bundle.graph;
    })(),
    graph_history: bundle.history,
    user_mode_profile: profileBackup,
    profile_correction_history: bundle.correctionState.corrections,
    profile_suppression_list: bundle.correctionState.suppressionList,
    profile_traits: bundle.correctionState.traits,
    learning_trace: bundle.learningTraces,
    provisional_queue: bundle.provisional,
    world_items: bundle.worldItems,
    adaptive_radar_state: {
      signals: bundle.signals,
      cursor: null,
    },
  };
}

export function exportBackupSnapshotFromStorage(
  storage: MobileStorage,
  options: BackupExportOptions = {},
): BackupSnapshotPayload {
  const bundle = storage.hydrateBundle();
  const payload = exportBackupSnapshotFromBundle(bundle, options);
  payload.adaptive_radar_state.cursor = storage.loadAdaptiveRadarCursor();
  return payload;
}

export function serializeBackupSnapshot(payload: BackupSnapshotPayload): string {
  return JSON.stringify(payload, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseBackupJson(text: string): BackupSnapshotPayload {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new MalformedBackupJsonError("Backup JSON is empty");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const detail = error instanceof SyntaxError ? error.message : "Invalid JSON";
    throw new MalformedBackupJsonError(`Backup JSON parse failed: ${detail}`);
  }
  return parseBackupSnapshot(parsed);
}

export function parseBackupSnapshot(json: unknown): BackupSnapshotPayload {
  if (!isRecord(json)) {
    throw new MalformedBackupJsonError("Backup payload must be a JSON object");
  }
  if (!isRecord(json.manifest)) {
    throw new MalformedBackupJsonError("Backup payload must include manifest object");
  }
  const manifestVersion = json.manifest.backup_manifest_version;
  if (typeof manifestVersion !== "number") {
    throw new MalformedBackupJsonError(
      "Backup manifest must include numeric backup_manifest_version",
    );
  }
  if (!Array.isArray(json.manifest.included_entities)) {
    throw new MalformedBackupJsonError(
      "Backup manifest must include included_entities array",
    );
  }
  if (!isRecord(json.graph_snapshot)) {
    throw new MalformedBackupJsonError("Backup payload must include graph_snapshot object");
  }
  if (!Array.isArray(json.graph_snapshot.nodes) || !Array.isArray(json.graph_snapshot.edges)) {
    throw new MalformedBackupJsonError(
      "graph_snapshot must include nodes[] and edges[] arrays",
    );
  }
  if (!isRecord(json.user_mode_profile)) {
    throw new MalformedBackupJsonError("Backup payload must include user_mode_profile object");
  }
  if (!Array.isArray(json.graph_history)) {
    throw new MalformedBackupJsonError("Backup payload must include graph_history array");
  }
  // JSON starts as an unknown record; the required payload structure is validated above.
  return json as unknown as BackupSnapshotPayload;
}

/** Graph-only export helper for harness/tests — not a full M7A backup. */
export function exportGraphJson(snapshot: GraphSnapshot): string {
  return JSON.stringify(
    {
      schemaVersion: "my-brain-graph/1.0",
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    },
    null,
    2,
  );
}
