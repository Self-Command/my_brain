import hashlib
import json
import os
import pathlib
import re
import subprocess
import zipfile

if os.environ.get("GITHUB_ACTIONS") != "true":
    raise RuntimeError("APK verification runs in Actions only")
sdk = pathlib.Path(os.environ["ANDROID_HOME"]) / "build-tools/35.0.0"
apk = pathlib.Path("apps/mobile/android/app/build/outputs/apk/release/app-release.apk")
old = pathlib.Path("baseline-apk/my-brain-android.apk")

def tool(name, *args):
    return subprocess.check_output([str(sdk / name), *map(str, args)], text=True)

signature = tool("apksigner", "verify", "--verbose", "--print-certs", apk)
baseline_signature = tool("apksigner", "verify", "--print-certs", old)
digest = re.search(r"certificate SHA-256 digest: (\w+)", signature).group(1)
assert digest == re.search(r"certificate SHA-256 digest: (\w+)", baseline_signature).group(1), "Upgrade signing certificate changed"
package = tool("aapt", "dump", "badging", apk)
baseline_package = tool("aapt", "dump", "badging", old)
identity = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", package)
previous = re.search(r"package: name='([^']+)' versionCode='(\d+)'", baseline_package)
assert identity.group(1) == previous.group(1) == "app.mybrain.personal"
assert int(identity.group(2)) > int(previous.group(2)), "Version must increase"
with zipfile.ZipFile(apk) as archive:
    bundle = archive.read("assets/index.android.bundle")
    assert len(bundle) > 100_000, "Missing embedded production JS"
    assert not any(name.endswith((".env", ".env.local")) for name in archive.namelist())
    # Scan values, not environment-variable names present in compiled configuration readers.
    for pattern in [rb"sk-[A-Za-z0-9_-]{24,}", rb"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----", rb"github_pat_[A-Za-z0-9_]{40,}", rb"ghp_[A-Za-z0-9]{30,}"]:
        assert not re.search(pattern, bundle), "Sensitive value detected in embedded JS"
    assert b"api.krill-code.net" not in bundle, "Donor relay must not be shipped"
sha = hashlib.sha256(apk.read_bytes()).hexdigest()
pathlib.Path("apk-verification.json").write_text(json.dumps({
    "sha": os.environ["GITHUB_SHA"], "applicationId": identity.group(1),
    "versionCode": int(identity.group(2)), "versionName": identity.group(3),
    "sameSigningCertificate": True, "certificateSha256": digest,
    "embeddedJavaScript": "PASS", "sensitiveValueScan": "PASS", "apkSha256": sha,
}, indent=2))
