# Lutron IPL Events

Experimental MQTT event entities for configured IPL UI level reports. Add `https://github.com/thetimetraveler/lutron-ipl-app` to the HA OS App store repositories and install **Lutron IPL Events**. Home Assistant Green / HA OS (`aarch64`) is the primary packaging target; `amd64` is also declared. See [DOCS.md](DOCS.md) for installation, separate credentials, TLS verification boundaries, and optional automation. This background app is not installed through HACS.

This listener observes UI telemetry. It cannot control lighting or Sunnata LEDs, identify a fresh touch after reconnect, or guarantee MQTT delivery. No automation is installed. Local container builds and installation on Green still require operator verification.
