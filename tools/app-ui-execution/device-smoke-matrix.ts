// A coverage checklist, never a substitute for device execution evidence.
export const S13_SMOKE_PATHS = [
  "launch-and-hydrate", "provider-save-restart", "text-chat", "voice-connect",
  "interrupt-playback", "confirm-ingest", "reject-ingest", "curation-undo", "archive-restore",
] as const;
export function buildS13MockDeviceEvidence() {
  return (["android", "ios"] as const).flatMap((platform) => S13_SMOKE_PATHS.map((pathId) => ({
    platform, pathId, source: "mock" as const, result: "NOT_RUN" as const,
    replaceWithRealDeviceEvidence: true,
    artifactPaths: [`S13-${platform}-smoke/${pathId}.json`],
  })));
}
