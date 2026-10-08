ARCHES := x86 arm
TS_CHECK := npx tsc --noEmit && npm test
# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk

javascript/index.js: Makefile $(wildcard test/*.test.ts test/*.test.cjs)
