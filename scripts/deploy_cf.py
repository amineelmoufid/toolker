import os
import subprocess
import sys

# Read from environment or fallback file
token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
if not token:
    token_file = "C:/Users/amine/Desktop/tools/cloudflare api minhoo.txt"
    if os.path.exists(token_file):
        with open(token_file, "r", encoding="utf-8") as f:
            for line in f:
                if "cfat_" in line:
                    token = line.strip()
                    break

account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "483a21a37ba2b6961a3318bf2c3b0061")

env = os.environ.copy()
if token:
    env["CLOUDFLARE_API_TOKEN"] = token
if account_id:
    env["CLOUDFLARE_ACCOUNT_ID"] = account_id

print("Step 1: Building production bundle (vite build)...")
build_res = subprocess.run(["npm.cmd", "run", "build"], env=env, capture_output=True, text=True)
print(build_res.stdout)
if build_res.returncode != 0:
    print("Build failed:", build_res.stderr)
    sys.exit(1)

print("\nStep 2: Deploying to Cloudflare Pages (toolker, branch: main)...")
deploy_res = subprocess.run(
    ["npx.cmd", "wrangler", "pages", "deploy", "dist", "--project-name", "toolker", "--branch", "main"],
    env=env,
    capture_output=True,
    text=True
)
print("DEPLOY STDOUT:\n", deploy_res.stdout)
print("DEPLOY STDERR:\n", deploy_res.stderr)
print("Exit code:", deploy_res.returncode)

if deploy_res.returncode == 0:
    print("\nSUCCESS! Deployment completed successfully!")
else:
    print("\nDeployment failed with exit code:", deploy_res.returncode)
    sys.exit(deploy_res.returncode)
