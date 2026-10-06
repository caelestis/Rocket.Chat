# Shipping this fork to production

Production runs [rocketchat-compose](https://github.com/RocketChat/rocketchat-compose),
whose `compose.yml` reads the image from two variables:

```
image: ${IMAGE:-registry.rocket.chat/rocketchat/rocket.chat}:${RELEASE:-...}
```

So the fork only has to publish an image somewhere and `.env` on the server has to
point at it. Nothing else in the compose stack changes: MongoDB, Traefik and the
volumes stay as they are, and the fork's image is a drop-in replacement because it is
built from the same Dockerfile upstream uses.

## Branch and tag model

- `master` holds the fork: the upstream release tag (`8.9.0` today) plus one commit per
  feature on top. Keep it that way; see `docs/features/` for what each commit is.
- A production build is a tag on `master` named `<upstream>-custom.<n>`, for example
  `8.9.0-custom.1`. The suffix says which upstream release it contains; `n` increments
  for fixes on the same base.
- Moving to a new upstream release is a rebase, then a new tag:

```sh
git fetch origin --tags
git rebase --onto 8.10.0 8.9.0 master
# fix conflicts, run the checks, then
git tag 8.10.0-custom.1
git push fork master --force-with-lease && git push fork 8.10.0-custom.1
```

`origin` is upstream `RocketChat/Rocket.Chat`; `fork` is your own GitHub repository.

## Building the image

### On GitHub (recommended)

`.github/workflows/custom-image.yml` runs on every `*-custom.*` tag pushed to the fork.
It builds the Meteor bundle the same way upstream CI does, builds the
`release-standard` target of `apps/meteor/.docker/Dockerfile.alpine` from it, the same
file the official image comes from, and pushes
`ghcr.io/<owner>/rocket.chat:<tag>` (plus `:latest`) to GitHub Container Registry
with the repository's own token. No secrets to configure. A full build takes about
40 minutes on the free runners.

The package is private when the repository is private. Either make the package
public in its GitHub settings, or log the production host in once:

```sh
echo <PAT with read:packages> | docker login ghcr.io -u <owner> --password-stdin
```

### Locally

`scripts/build-custom-image.sh ghcr.io/<owner>/rocket.chat:8.9.0-custom.1 --push`
does the same on the current machine. It needs Meteor, Node and Yarn set up as for
development, and Docker with buildx. It always targets `linux/amd64`.

## Pointing production at it

In the rocketchat-compose directory on the server, in `.env`:

```
IMAGE=ghcr.io/<owner>/rocket.chat
RELEASE=8.9.0-custom.1
```

then `docker compose pull && docker compose up -d`. Rolling back is setting `RELEASE`
to the previous tag and repeating the two commands; the database is shared by all
tags of one upstream release.

## What the image adds over upstream

- `ffmpeg`, which voice message transcription needs for audio recorded by the mobile
  apps (`docs/features/voice-transcription.md`). It is copied as a static binary from
  the `mwader/static-ffmpeg` image, so no package repository is involved.

Native modules (`sharp`, `esbuild`, `pinyin`) ship platform binaries. The runner is
glibc and the image is Alpine (musl), so Yarn is told to fetch both flavours and the
bundle is trimmed to the `linuxmusl-x64` ones before the Docker build, exactly as
upstream CI does. Skipping either step yields an image that crashes on start with
"Could not load the sharp module using the linuxmusl-x64 runtime".

`Dockerfile.debian` is left untouched and is not used: the Debian release it is based
on no longer serves its security archive, so even upstream's own package list fails
to install there today.

Everything else is code. First-run settings the features add (`Transcription_*`,
`Notifications_On_Reactions`) register themselves on startup with safe defaults.
