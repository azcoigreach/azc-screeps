# ================================
# Stage 1: Builder Stage
# ================================
FROM python:3.11-slim as builder

ARG PROMETHEUS_VERSION=2.48.0
ARG TARGETARCH
WORKDIR /tmp

# Install dependencies for downloading and extracting
RUN apt-get update && apt-get install -y wget tar ca-certificates && apt-get clean

# Download Prometheus based on architecture
RUN if [ "$TARGETARCH" = "arm64" ]; then \
        wget https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-arm64.tar.gz && \
        tar xvfz prometheus-${PROMETHEUS_VERSION}.linux-arm64.tar.gz && \
        mv prometheus-${PROMETHEUS_VERSION}.linux-arm64 /prometheus; \
    else \
        wget https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz && \
        tar xvfz prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz && \
        mv prometheus-${PROMETHEUS_VERSION}.linux-amd64 /prometheus; \
    fi && \
    rm -rf /tmp/*

# Pip install Python libraries
RUN pip install --no-cache-dir prometheus_client requests

# ================================
# Stage 2: Final Image
# ================================
FROM python:3.11-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y supervisor ca-certificates && apt-get clean

# Copy Prometheus from builder
COPY --from=builder /prometheus /prometheus

# Copy Python site-packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy config files
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY screeps_exporter.py /app/screeps_exporter.py

# Create necessary directories
RUN mkdir -p /prometheus-data /var/log/supervisor

# Expose ports:
#  - 9090 for Prometheus UI
#  - 8000 for the Python exporter
EXPOSE 9090
EXPOSE 8000

# Environment variables you can override at runtime:
#   SCREEPS_TOKEN       - your Screeps API token
#   SCREEPS_SHARD       - default "shard3"
#   SCREEPS_MEMORY_PATH - default "myStats"
#   SCRAPE_INTERVAL     - default "15" (seconds)
ENV SCREEPS_TOKEN="" \
    SCREEPS_SHARD="shard3" \
    SCREEPS_MEMORY_PATH="myStats" \
    SCRAPE_INTERVAL="15"

# Supervisor will launch both Prometheus and the exporter
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
