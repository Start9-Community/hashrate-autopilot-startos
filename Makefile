ARCHES := x86 arm
TS_CHECK := npx tsc --noEmit && npm test
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk

javascript/index.js: Makefile $(wildcard test/*.test.ts test/*.test.cjs)

# The SDK tracks the Dockerfile. Also repack when its copied inputs change.
$(BASE_NAME).s9pk $(BASE_NAME)_x86_64.s9pk $(BASE_NAME)_aarch64.s9pk: $(wildcard patches/*) .dockerignore
