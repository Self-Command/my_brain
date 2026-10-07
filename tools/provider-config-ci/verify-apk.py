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
manifest = tool("aapt", "dump", "xmltree", apk, "AndroidManifest.xml")
assert "android.speech.RecognitionService" in manifest, "Missing Android 11+ recognition service visibility"
with zipfile.ZipFile(apk) as archive:
    bundle = archive.read("assets/index.android.bundle")
    assert len(bundle) > 100_000, "Missing embedded production JS"
    assert not any(name.endswith((".env", ".env.local")) for name in archive.namelist())
    # Hermes concatenates interned strings without separators; raw regexes can join
    # unrelated strings or mistake the 'sk-' inside 'task-' for a credential.
    bundle_path = pathlib.Path("provider-bundle.hbc"); bundle_path.write_bytes(bundle)
    package_path = subprocess.check_output(["node", "-p", "require.resolve('react-native/package.json', {paths:['./apps/mobile']})"], text=True).strip()
    compiler = pathlib.Path(package_path).parent / "sdks/hermesc/linux64-bin/hermesc"
    # The disassembler can emit non-UTF8 bytes from interned strings. Latin-1
    # preserves every byte and every ASCII credential instead of dropping errors.
    decoded = subprocess.check_output([str(compiler), "-dump-bytecode", str(bundle_path)]).decode("latin-1")
    findings = []
    rules = {
        "openai-key": r"(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{24,}",
        "github-token": r"(?<![A-Za-z0-9_])(?:github_pat_[A-Za-z0-9_]{40,}|ghp_[A-Za-z0-9]{30,})",
        "private-key": r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----(?:\\n|\s)+[A-Za-z0-9+/=]{40,}",
    }
    for rule, pattern in rules.items():
        for match in re.finditer(pattern, decoded):
            findings.append({"rule": rule, "length": len(match.group()), "valueSha256": hashlib.sha256(match.group().encode()).hexdigest()})
    pathlib.Path("sensitive-scan.json").write_text(json.dumps({"status": "FAIL" if findings else "PASS", "scanBasis": "Hermes disassembly; byte-preserving ASCII credential scan", "findings": findings}, indent=2))
    assert not findings, "Sensitive value detected; fingerprints recorded without disclosing values"
    assert b"api.krill-code.net" not in bundle, "Donor relay must not be shipped"
sha = hashlib.sha256(apk.read_bytes()).hexdigest()
pathlib.Path("apk-verification.json").write_text(json.dumps({
    "sha": os.environ["GITHUB_SHA"], "applicationId": identity.group(1),
    "versionCode": int(identity.group(2)), "versionName": identity.group(3),
    "sameSigningCertificate": True, "certificateSha256": digest,
    "embeddedJavaScript": "PASS", "sensitiveValueScan": "PASS", "speechRecognitionServiceVisibility": "PASS", "apkSha256": sha,
}, indent=2))
