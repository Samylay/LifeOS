FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
# Trusted toolchain build only, never a candidate's Dockerfile on the live host.
RUN npm install --global --ignore-scripts typescript@5.9.3 && npm cache clean --force
COPY scanners/gitleaks scanners/syft scanners/grype /usr/local/bin/
USER 65534:65534
