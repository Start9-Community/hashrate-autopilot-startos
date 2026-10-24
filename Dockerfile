ARG IMAGE
FROM ${IMAGE}
# Node otherwise trusts its compiled-in roots, and the image ships no system store to point it at.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
 && ! grep -q MIICTjCCAdOgAwIBAgIKPPYHqWhwDtqLhDAKBggqhkjOPQQDAzBr /etc/ssl/certs/ca-certificates.crt
ENV NODE_OPTIONS=--use-openssl-ca
COPY --from=node:22.23.4-bookworm-slim /usr/local/bin/node /usr/local/bin/node
ENV NODE_VERSION=22.23.4
