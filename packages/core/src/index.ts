export type {

  AdaptivePrivacyLevel,

  AdaptiveSignal,

  AdaptiveSourceType,

  AdaptiveSuggestedIntent,

} from "./domain/adaptiveSignal.js";

export type { UserMode, UserModeProfile } from "./domain/userMode.js";

export { isUserMode, USER_MODES } from "./domain/userMode.js";



export {

  GraphTransactionError,

  IngestProposalError,

  ProviderConfigError,

  ProvisionalPersistError,

  RealtimeVoiceTransportError,

  SchemaMigrationError,

  StorageInitError,

  SyncConflictError,

  TokenExchangeError,

  UserModeRoutingError,

} from "./errors/index.js";

export type { ProviderConfigErrorCode } from "./errors/index.js";



export { DEFAULT_APP_ENV } from "./env/readAppEnv.js";

export type { ReadAppEnv } from "./env/readAppEnv.js";

export type { AppEnv, AppRuntime, ProviderMode } from "./env/types.js";



export {

  createMockLlmProvider,

  createMockNewsSource,

  createMockProviderBundle,

  createMockVoiceProvider,

} from "./providers/mockFactories.js";

export {
  createDeepSeekLlmProvider,
  createOpenAiCompatibleLlmProvider,
  hasLlmApiKey,
} from "./providers/openAiCompatibleLlmProvider.js";

export {
  COMPANION_ENV_KEYS,
  companionEnvConfigured,
  readCompanionEnvFromRecord,
  readDoubaoVoiceCredentialsFromEnv,
  type CompanionEnvKey,
  type CompanionEnvSnapshot,
  type DoubaoVoiceEnvCredentials,
} from "./providers/companionEnvKeys.js";

export {
  createModelScopeLlmProvider,
  DEFAULT_MODELSCOPE_BASE_URL,
  DEFAULT_MODELSCOPE_MODEL,
} from "./providers/modelscopeLlmProvider.js";

export {
  buildDoubaoConnectHeaders,
  decodeDoubaoVolcFrame,
  doubaoCredentialsConfigured,
  encodeDoubaoStartConnection,
  testDoubaoVoiceConnection,
  type DoubaoVoiceConnectionTestResult,
  type DoubaoVoiceCredentials,
  type DoubaoWebSocketConstructor,
} from "./providers/doubaoVoiceConnectionTest.js";

export {
  DEFAULT_DOUBAO_DIALOG_SESSION,
  DEFAULT_DOUBAO_DIALOG_MODEL,
  buildDoubaoDialogSessionPayload,
  resolveDoubaoDialogModel,
  VOLC_CLIENT_EVENT,
  VOLC_REALTIME_WS_URL,
  VOLC_SERVER_EVENT,
  type DoubaoDialogStartSessionPayload,
} from "./providers/volcDoubaoConstants.js";

export {
  encodeDoubaoFinishConnection,
  encodeDoubaoFinishSession,
  encodeDoubaoSayHello,
  encodeDoubaoStartSessionFrame,
  encodeDoubaoTaskRequest,
  extractAsrText,
  extractChatText,
  parseDoubaoDialogFrame,
  type ParsedDoubaoDialogFrame,
} from "./providers/doubaoDialogProtocol.js";

export type {

  LlmConnectionStatus,

  LlmConnectionTestResult,

  LlmProvider,

  LlmProviderErrorCode,

  LlmStructuredJsonRequest,

  LlmStructuredJsonResult,

  NewsSource,

  ProviderBundle,

  VoiceConnectionState,

  VoiceProvider,

} from "./providers/types.js";



export { STORAGE_SCHEMA_VERSION, MOBILE_DB_NAME } from "./storage/schema.js";

export type { StoragePort } from "./storage/port.js";

export type { SqlDriver } from "./storage/sqlDriver.js";

export { BetterSqliteDriver } from "./storage/betterSqliteDriver.js";

export {
  MobileStorage,
  type LearningTraceRecord,
  type MobilePersistedBundle,
  type PendingIngestProposal,
  type ProviderConfigSnapshot,
  type WorldItemRecord,
} from "./storage/mobileStorage.js";

export {
  isWhitelistedDiagnosticEvent,
  sanitizeDiagnosticExport,
  scanExportPayloadForViolations,
  enrichDiagnosticEventsForExport,
  buildDiagnosticExportDocument,
  serializeDiagnosticExportDocument,
  DIAGNOSTIC_EXPORT_SCHEMA_VERSION,
  type DiagnosticEvent,
  type DiagnosticOutcome,
  type DiagnosticExportContext,
  type DiagnosticExportDocument,
} from "./storage/diagnosticWhitelist.js";

export {
  buildProviderStatusFromDegraded,
  deriveDegradedFromProviderSnapshot,
  PROVIDER_STATUS_TEST_IDS,
  type ProviderPanelStatus,
  type ProviderStatusLiveOverrides,
} from "./storage/providerStatus.js";



export { CORE_INVARIANTS } from "./invariants/index.js";

export type { CoreInvariant } from "./invariants/index.js";



export type {

  GraphChangeKind,

  GraphChangeRecord,

  GraphEdge,

  GraphNode,

  GraphRepository,

  GraphSnapshot,

  HistoryRepository,

} from "./graph/types.js";

export {

  InMemoryGraphRepository,

  InMemoryHistoryRepository,

  restoreSnapshotFromChange,

} from "./graph/memoryRepository.js";

export {
  BRAIN_MAP_VISIBLE_MAX,
  BRAIN_MAP_VISIBLE_MIN,
  DEFAULT_NODE_BUDGET,
  clampNodeBudget,
  isWithinNodeBudget,
  selectBudgetedNodes,
} from "./graph/nodeBudget.js";



export type {

  ProvisionalCandidate,

  ProvisionalSourceType,

  ProvisionalStatus,

} from "./provisional/types.js";

export {

  addCandidate,

  confirmCandidate,

  createProvisionalCandidate,

  explainCandidate,

  listPendingCandidates,

  rejectCandidate,

} from "./provisional/queue.js";

export type { ConfirmResult, ProvisionalQueueDeps } from "./provisional/queue.js";

export {
  captureOcrFixture,
  captureShareLink,
  captureSyncImportFixture,
  ssrfRejectUserHint,
} from "./provisional/ingestGate.js";
export type { CaptureIngestGateDeps, LinkCaptureResult } from "./provisional/ingestGate.js";

export {
  attemptOnDeviceOcr,
  buildOcrProvisionalCandidate,
  OCR_POLICY,
} from "./provisional/ocrBoundary.js";
export type { OcrAttemptResult, OcrAttemptStatus, ImageCaptureMetadata } from "./provisional/ocrBoundary.js";

export {
  sharePayloadRejectUserHint,
  validateSharePayload,
} from "./provisional/sharePayload.js";
export type {
  SharePayload,
  SharePayloadKind,
  SharePayloadRejectCode,
  SharePayloadValidationResult,
  SharePlatform,
  ValidatedSharePayload,
} from "./provisional/sharePayload.js";

export {
  getSharePayloadFixture,
  listSharePayloadFixtureIds,
  M4_SHARE_PAYLOAD_FIXTURES,
} from "./provisional/sharePayloadFixtures.js";
export type {
  ShareFixtureExpectIntake,
  SharePayloadFixture,
} from "./provisional/sharePayloadFixtures.js";

export {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
  createLiveUrlFetchGuardDeps,
  guardedUrlFetch,
  resolvePublicDnsViaDoh,
  validateUrlAllowlist,
} from "./provisional/urlFetchGuard.js";
export type {
  MockFetchResponse,
  SsrfRejectCode,
  UrlFetchFail,
  UrlFetchGuardDeps,
  UrlFetchGuardOptions,
  UrlFetchOk,
  UrlFetchResult,
} from "./provisional/urlFetchGuard.js";



export {

  applyExplainMoreToState,

  applyUserIntent,

  buildMockExplainFallback,

  createInitialConversationState,

  enterProvisionalPending,

  resolveExplainMore,

  resolveExplainTopicFromConversation,

  selectAdaptiveSignal,

} from "./conversation/conductor.js";

export {
  appendCasualTurn,
  assertCasualChatGraphBoundary,
  createEphemeralConversation,
  isEphemeralSessionActive,
  rejectEphemeralMemory,
  runCasualChatGraphBoundaryCheck,
  simulateExtendedCasualSession,
  trimEphemeralContext,
  EPHEMERAL_CONTEXT_MAX_TURNS,
  EPHEMERAL_SESSION_MAX_MS,
} from "./conversation/ephemeralChat.js";

export type {
  AppendCasualTurnResult,
  EphemeralChatTurn,
  EphemeralConversationState,
} from "./conversation/ephemeralChat.js";

export {
  assertSaveIntentCreatesCandidateOnly,
  createAssetCandidateFromChatSave,
  extractSaveSummaryFromChat,
  hasExplicitSaveIntent,
  hasRejectMemoryIntent,
} from "./conversation/saveIntent.js";

export {
  assertWorldObserverDoesNotMutateGraph,
  buildWorldItemFromHeadline,
  buildWorldSignal,
  DEFAULT_WORLD_SOURCE_LABELS,
  observeWorldHeadlines,
  worldItemDisplayTime,
  WORLD_OBSERVER_FIXTURE_HEADLINES,
} from "./observer/worldObserver.js";
export type {
  ExternalHeadlineInput,
  WorldItem,
  WorldObservation,
  WorldSignal,
  WorldSourceType,
} from "./observer/worldObserver.js";

export {
  assertPersonalObserverDoesNotMutateGraph,
  extractPersonalSignalsFromEphemeralChat,
} from "./observer/personalObserver.js";
export type {
  PersonalSignal,
  PersonalSignalSource,
} from "./observer/personalObserver.js";

export {
  assertConfirmedIngestOnly,
  assetTypeFromProvisionalSource,
  asCognitiveAssetCandidate,
  CognitiveAssetType,
  COGNITIVE_ASSET_TYPE_LABELS,
  cognitiveAssetTypeLabel,
  confirmUserIngest,
  formatCandidateTypeLabel,
  isCognitiveAssetCandidate,
  isCognitiveAssetPermanent,
  toPermanentCognitiveAsset,
} from "./asset/cognitiveAsset.js";
export type {
  CognitiveAssetCandidate,
  CognitiveAssetPermanent,
  CognitiveAssetRecord,
  ConfirmedIngestGate,
} from "./asset/cognitiveAsset.js";

export type {

  ApplyUserIntentOptions,

  ConversationPhase,

  ConversationState,

  ConversationTurn,

  ExplainTopicContext,

  UserIntent,

} from "./conversation/conductor.js";

export type {

  ExplainMoreInput,

  ExplainMoreResult,

  ExplainMoreSource,

} from "./conversation/explain.js";

export {

  applyIngestCreate,

  getAutoCurateBoundary,

  runAutoCurateAfterIngest,

  runAutoCurateBoundary,

  setAutoCurateBoundary,

  undoLastGraphChangeInMemory,

} from "./conversation/ingest.js";

export type {

  AutoCurateBoundary,

  AutoCurateResult,

  IngestDeps,

  IngestInput,

  IngestResult,

} from "./conversation/ingest.js";

export {
  ingestCommandToUserIntent,
  parseIngestCommand,
  resolveVoiceTranscript,
} from "./voice/ingestIntent.js";
export type {
  IngestCommand,
  IngestParseResult,
  VoiceIntentResolution,
} from "./voice/ingestIntent.js";

export {

  COLD_START_FIXTURES,

  buildMemoryWeatherV0,

  generateAdaptiveSignals,

  inferUserModeProfileFromDialogue,

  rankAdaptiveSignals,

} from "./radar/adaptiveRadar.js";

export type { ColdStartFixture, MemoryWeatherSnapshot } from "./radar/adaptiveRadar.js";

export {
  COLD_START_MIN_USER_TURNS,
  coldStartAssistantReply,
  cyclePrimaryMode,
  formatProfileModeLine,
  inferColdStartProfile,
  isColdStartDialogueComplete,
} from "./coldStart/coldStartDialogue.js";

export {
  deriveFirstStarCandidate,
  type FirstStarCandidate,
} from "./coldStart/firstPersonalStar.js";

export { fetchLiveRadarSignals } from "./radar/liveRadar.js";

export type { LiveRadarMode, LiveRadarOptions, LiveRadarResult } from "./radar/liveRadar.js";

export type { RadarFetch } from "./radar/radarFetch.js";



export {

  applyCorrectionToProfile,

  applyProfileCorrection,

  createDefaultDegradedState,

  createEmptyCorrectionState,

  degradedBannerText,

  isTraitVisible,

  seedTraitsFromProfile,

  userModeLabel,

  DEGRADED_MODE_LABELS,

} from "./profile/correctionHistory.js";

export type {

  CorrectionRecord,

  DegradedModeCode,

  DegradedModeState,

  ProfileCorrectionState,

  ProfileTrait,

} from "./profile/correctionHistory.js";

export {
  buildEvidenceBundle,
  buildM5SignatureExperiences,
} from "./memory/signatureExperiences.js";
export {
  collectEvidenceRefs,
  hasAnyEvidence,
  graphChangeRef,
  learningTraceRef,
  radarSignalRef,
  captureRef,
  nodeRef,
} from "./memory/evidence.js";
export { buildMemoryWeather } from "./memory/memoryWeather.js";
export { buildMemoryReplay, measureReplayColdStartMs } from "./memory/memoryReplay.js";
export { buildReverseQuestion } from "./memory/reverseQuestion.js";
export {
  listChangesAfterCursor,
  replayCursorFromChanges,
} from "./memory/incrementalHistory.js";
export {
  assertNoFullNodeScan,
  beginReplayQueryAudit,
  endReplayQueryAudit,
  recordReplayQuery,
} from "./memory/replayQueryAudit.js";
export {
  M5_FEATURE_FLAG_DEFAULTS,
  isM5ExperienceEnabled,
  resolveM5FeatureFlags,
} from "./memory/featureFlags.js";
export {
  M5_MODE_FIXTURES,
  getM5FixtureById,
  getM5FixtureByMode,
  runM5Fixture,
} from "./memory/m5Fixtures.js";
export type { M5FixtureSeedData } from "./memory/m5Fixtures.js";
export type { M5FeatureFlags } from "./memory/featureFlags.js";
export type {
  M5EvidenceBundle,
  M5FixtureExpected,
  M5ModeFixture,
  M5SignatureExperiences,
  MemoryReplayFrame,
  MemoryReplayOutputKind,
  MemoryReplayResult,
  MemoryWeatherCard,
  MemoryWeatherOutputKind,
  MemoryWeatherResult,
  ReverseQuestionOutputKind,
  ReverseQuestionResult,
} from "./memory/types.js";
export {
  M5_REPLAY_BATCH_LIMIT,
  M5_REPLAY_DURATION_MS,
  M5_VISIBLE_NODE_BUDGET,
} from "./memory/types.js";
export {
  getM5GraphCandidatesFromRepository,
  selectM5GraphCandidates,
} from "./memory/m5GraphCandidates.js";
export type { M5GraphCandidateSlice } from "./memory/m5GraphCandidates.js";

export {
  BACKUP_MANIFEST_VERSION,
  BACKUP_REQUIRED_ENTITIES,
} from "./backup/types.js";
export type {
  BackupEntityId,
  BackupExportOptions,
  BackupImportOptions,
  BackupManifest,
  BackupSnapshotPayload,
} from "./backup/types.js";
export {
  ManifestEntityMissing,
  ImportSchemaMismatch,
  BackupDecryptError,
  BackupCryptoUnavailableError,
  MergeTransactionError,
  IngestGateViolation,
  isBackupStructuredError,
} from "./backup/errors.js";
export type { BackupStructuredError } from "./backup/errors.js";
export {
  buildBackupManifest,
  validateBackupManifest,
  assertBackupPayloadEntities,
  listMissingManifestEntities,
} from "./backup/manifest.js";
export {
  exportBackupSnapshotFromBundle,
  exportBackupSnapshotFromStorage,
  exportGraphJson,
  parseBackupJson,
  parseBackupSnapshot,
  serializeBackupSnapshot,
} from "./backup/exportBackup.js";
export {
  importBackupSnapshot,
  validateBackupImport,
  backupPayloadToPersistedBundle,
} from "./backup/importBackup.js";
export { importGraphJson, normalizeGraphSnapshot } from "./backup/importGraphJson.js";
export {
  encryptBackupSnapshot,
  decryptBackupSnapshot,
  parseEncryptedBackup,
  serializeEncryptedBackup,
} from "./backup/encryptedBackup.js";
export type { EncryptedBackupEnvelope } from "./backup/encryptedBackupTypes.js";
export {
  configureBackupCryptoPort,
  createUnavailableBackupCryptoPort,
  getBackupCryptoPort,
  isBackupCryptoAvailable,
  resetBackupCryptoPortForTests,
} from "./backup/cryptoPort.js";
export type { BackupCryptoPort } from "./backup/cryptoPort.js";
export { assertGraphExportIngestGate } from "./backup/exportBackup.js";

export {
  SYNC_MANIFEST_VERSION,
  SYNC_REQUIRED_ENTITIES,
} from "./sync/types.js";
export type {
  SyncEntityId,
  SyncManifest,
  SyncPayload,
  SyncProvider,
  SyncPullResult,
  SyncPushResult,
  ProfileConflictResolution,
  SyncMergeOptions,
  SyncMergeResult,
} from "./sync/types.js";
export {
  SyncIngestGateViolation,
  SyncMergeTransactionError,
  isSyncStructuredError,
} from "./sync/errors.js";
export type { SyncStructuredError } from "./sync/errors.js";
export {
  isConfirmedIngestNode,
  partitionRemoteGraphNodes,
  remoteNodesToProvisional,
  assertMergedGraphIngestGate,
  assertRemoteIngestGatePartition,
  USER_CONFIRMED_INGEST,
} from "./sync/ingestGate.js";
export {
  mergeGraphSnapshots,
  mergeGraphHistory,
  collectRemoteDeleteIntents,
  collectEdgeMigrationMap,
} from "./sync/conflictMerge.js";
export {
  detectProfileConflicts,
  mergeProfileCorrectionState,
  mergeUserModeProfile,
  remoteWouldSilentlyOverwriteManual,
} from "./sync/profileMerge.js";
export {
  buildSyncManifest,
  validateSyncManifest,
  assertSyncPayloadEntities,
  listMissingSyncEntities,
} from "./sync/manifest.js";
export { bundleToSyncPayload, mergeSyncPayloads } from "./sync/mergeSyncPayload.js";
export { MockSyncProvider, createTwoDeviceSyncHarness } from "./sync/mockSyncProvider.js";

export type {
  ActionAuditEntry,
  ActionConfirmation,
  ActionDraft,
  ActionDraftBuildContext,
  ActionDraftPayload,
  ActionDraftStatus,
  CognitiveActionType,
  CognitivePermissionLevel,
  DraftBlogPostPayload,
  DraftGithubIssuePayload,
  DraftLearningPathPayload,
  DraftResearchFollowupPayload,
  DraftRoadmapPayload,
  DraftWeeklyReviewPayload,
} from "./actions/types.js";
export { COGNITIVE_ACTION_TYPES, COGNITIVE_PERMISSION_LEVELS } from "./actions/types.js";
export {
  assertExecutionAllowed,
  createConfirmationToken,
  permissionLevelForAction,
  requiresRemoteWrite,
} from "./actions/executionGate.js";
export type { ExecutionGateErrorCode, ExecutionGateInput, ExecutionGateResult } from "./actions/executionGate.js";
export { buildActionDraft } from "./actions/draftBuilder.js";

export {
  runCompanionAutoCuration,
  undoCompanionAutoCuration,
} from "./companion/autoCurationCompanion.js";
export type {
  CompanionCurationHistoryEntry,
  CompanionCurationResult,
  CompanionUndoResult,
} from "./companion/autoCurationCompanion.js";

export { buildLivingHomeEntry } from "./companion/livingHomeEntry.js";
export type { LivingHomeEntry, LivingHomeEntryLine } from "./companion/livingHomeEntry.js";

export { enrichNodeDisplay } from "./companion/brainMapDisplay.js";
export type {
  NodeDisplayEnrichment,
  NodeDisplayState,
} from "./companion/brainMapDisplay.js";

export {
  buildDraftOnlyActions,
  buildWeeklyReviewDraft,
  cognitiveActionTypeForReviewDraft,
  DEFAULT_REVIEW_PROFILE,
} from "./companion/reviewActionLayer.js";
export type {
  ReviewDraftAction,
  ReviewDraftActionKind,
  WeeklyReviewDraft,
} from "./companion/reviewActionLayer.js";

export {
  ACTION_AUDIT_META_KEY,
  DEMO_FIXTURE_SOURCE,
  DEMO_MODE_META_KEY,
  DEMO_SEED_VERSION,
  DEMO_GRAPH_FIXTURE,
  DEMO_SHOWCASE_PROVISIONAL,
  DEMO_COLD_PROFILE,
  DEFAULT_DEMO_PROVIDER_CONFIG,
  SHOWCASE_FLOW_STEPS,
  SHOWCASE_OPTIONAL_ACTION_PREVIEW,
  assertDemoFixtureGraph,
  buildDemoSeedBundle,
  demoFixtureFingerprint,
  isDemoModeActive,
  resetDemoStorage,
} from "../demo/index.js";
export type {
  DemoGraphFixtureFile,
  ResetDemoCoreOptions,
  ResetDemoCoreResult,
  ShowcaseStepContract,
} from "../demo/index.js";

export * from "./providers/serviceConfig.js";
export * from "./providers/serviceCatalog.js";
export * from "./providers/ttsProtocol.js";
export { createOpenAiCompatibleCompletion, type OpenAiCompatibleMessage } from "./providers/openAiCompatibleClient.js";
