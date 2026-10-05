# Official Node image manifest includes linux/amd64 and linux/arm64.
FROM node:22.23.3-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

ARG BUILD_VERSION=0.2.1
ARG BUILD_ARCH=aarch64|amd64
LABEL io.hass.name="Lutron IPL Events" \
      io.hass.description="Experimental observational IPL reports and passive discovery over MQTT" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json THIRD_PARTY.md /app/
COPY dist/main.js /app/dist/main.js
COPY run.sh /app/run.sh
RUN chmod 0755 /app/run.sh
ENV IPL_OPTIONS_FILE=/data/options.json \
    IPL_CREDENTIAL_DIR=/config \
    IPL_DATA_DIR=/data
CMD ["/app/run.sh"]
