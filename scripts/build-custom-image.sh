#!/usr/bin/env bash
# Builds this fork into a Docker image on the current machine.
#
#   scripts/build-custom-image.sh ghcr.io/<owner>/rocket.chat:8.9.0-custom.1 [--push]
#
# Needs Node from package.json (volta), Yarn 4 via corepack, Meteor from
# apps/meteor/.meteor/release and Docker with buildx. The image targets linux/amd64;
# on an Apple Silicon Mac the native modules are compiled under emulation, which
# takes a while but produces the same image the GitHub workflow does.
set -euo pipefail

IMAGE="${1:?image name with tag, e.g. ghcr.io/me/rocket.chat:8.9.0-custom.1}"
PUSH="${2:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST=/tmp/rocketchat-dist

cd "$ROOT"
# The image runs on Alpine (musl): fetch native binaries for both libcs, keep musl below.
yarn config set supportedArchitectures --json '{"os": ["linux"], "cpu": ["x64"], "libc": ["glibc", "musl"]}'
yarn install --immutable
yarn build

rm -rf "$DIST"
(cd apps/meteor && METEOR_DEBUG_BUILD=1 METEOR_DISABLE_OPTIMISTIC_CACHING=1 meteor build --verbose --server-only --directory "$DIST")
find "$DIST/bundle" -type f -name '*.d.ts' -delete
NM="$DIST/bundle/programs/server/npm/node_modules"
find "$NM/@img" -type d -name 'sharp-*' -not -name '*-linuxmusl-x64' -exec rm -rf {} + 2>/dev/null || true
find "$NM/@napi-rs" -type d -name 'pinyin-linux-*' -not -name '*-linux-x64-*' -exec rm -rf {} + 2>/dev/null || true
find "$NM/@esbuild" -type d -name 'linux-*' -not -name '*-x64' -exec rm -rf {} + 2>/dev/null || true
find "$NM/@rocket.chat/apps/node_modules/@esbuild" -type d -name 'linux-*' -not -name '*-x64' -exec rm -rf {} + 2>/dev/null || true
cp apps/meteor/.docker/Dockerfile.alpine "$DIST/Dockerfile"

if [ "$PUSH" = "--push" ]; then
	docker buildx build --platform linux/amd64 --target release-standard --push -t "$IMAGE" "$DIST"
else
	docker buildx build --platform linux/amd64 --target release-standard --load -t "$IMAGE" "$DIST"
fi

echo "Built $IMAGE"
