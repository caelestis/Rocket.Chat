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
yarn install --immutable
yarn build

rm -rf "$DIST"
(cd apps/meteor && METEOR_DEBUG_BUILD=1 METEOR_DISABLE_OPTIMISTIC_CACHING=1 meteor build --verbose --server-only --directory "$DIST")
find "$DIST/bundle" -type f -name '*.d.ts' -delete
cp apps/meteor/.docker/Dockerfile.debian "$DIST/Dockerfile"

if [ "$PUSH" = "--push" ]; then
	docker buildx build --platform linux/amd64 --push -t "$IMAGE" "$DIST"
else
	docker buildx build --platform linux/amd64 --load -t "$IMAGE" "$DIST"
fi

echo "Built $IMAGE"
