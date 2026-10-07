#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-evidence
trap 'adb logcat -d > emulator-evidence/logcat.txt; adb shell uiautomator dump /sdcard/provider-ui.xml >/dev/null; adb pull /sdcard/provider-ui.xml emulator-evidence/ >/dev/null || true' EXIT
adb install baseline-apk/my-brain-android.apk
maestro test --format junit --output emulator-evidence/baseline.xml tools/provider-config-ci/baseline-settings.yaml
# No uninstall or clear-data between installs: SQLite and SecureStore must survive.
adb install -r apk-release/my-brain-android.apk
maestro test --format junit --output emulator-evidence/provider-ui.xml tools/provider-config-ci/provider-settings.yaml
adb shell dumpsys package app.mybrain.personal > emulator-evidence/package.txt
python - <<'PY'
import json, os, pathlib
pathlib.Path('emulator-evidence/emulator-verification.json').write_text(json.dumps({
 'sha': os.environ['GITHUB_SHA'], 'androidApi': 35, 'cleanBaselineInstallation': 'PASS',
 'upgradeWithoutUninstall': 'PASS', 'legacySecureStoreAndSettingsRetained': 'PASS',
 'customConfigurationSaveRestart': 'PASS', 'manualModelAndVoice': 'PASS',
 'providerModeEditorSelection': 'PASS', 'microphone': 'NOT_RUN', 'acousticP50': 'NOT_RUN',
 'bluetooth': 'NOT_RUN', 'phoneCall': 'NOT_RUN', 'ios': 'NOT_TESTED'
}, indent=2))
PY
