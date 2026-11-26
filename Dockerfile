ARG IMAGE
FROM ${IMAGE} AS upstream

# Apply the patch to the daemon module shipped for the target architecture.
FROM --platform=$BUILDPLATFORM alpine/git:2.52.0@sha256:4a0e72d49596a1f5d3701aeedafdadc5c0da4062be4657c7bdc4017387f591cc AS patcher
WORKDIR /work
COPY --from=upstream /app/packages/daemon/dist/services/datum.js .
COPY patches/datum.patch .
RUN git apply --check datum.patch && git apply datum.patch

FROM --platform=$BUILDPLATFORM ${IMAGE} AS checks
WORKDIR /work
COPY --from=patcher /work/datum.js .
COPY patches/datum-dashboard.mjs patches/datum.test.mjs ./
RUN node --test datum.test.mjs

FROM upstream
COPY --from=checks /work/datum.js /work/datum-dashboard.mjs /app/packages/daemon/dist/services/
