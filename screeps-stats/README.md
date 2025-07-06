# Screeps Stats
Statistics logging for the Screeps MMO.

## Requirements
- Screeps server API token
- Docker
- Docker Compose

## Installation

### Quick Start
1. Clone the repository
2. Run the setup script: `chmod +x setup.sh && ./setup.sh`
3. Edit the `.env` file with your Screeps server API token
4. Access the services:
   - Prometheus UI: http://localhost:9090
   - Grafana UI: http://localhost:3000 (admin/admin)

### Manual Installation
1. Clone the repository
2. Copy the example environment file: `cp example.env .env`
3. Edit the `.env` file with your Screeps server API token
4. Enable BuildKit: `export DOCKER_BUILDKIT=1`
5. Start services: `docker-compose up -d --build`

## Configuration

### Environment Variables
- `SCREEPS_TOKEN`: Your Screeps API token (required)
- `SCREEPS_SHARD`: Shard name (default: shard3)
- `SCREEPS_MEMORY_PATH`: Memory path for stats (default: myStats)
- `SCRAPE_INTERVAL`: Scrape interval in seconds (default: 15)
- `GF_SECURITY_ADMIN_USER`: Grafana admin username (default: admin)
- `GF_SECURITY_ADMIN_PASSWORD`: Grafana admin password (default: admin)

## Troubleshooting

### Common Issues

1. **Buildx Architecture Error**
   - Solution: The Dockerfile now supports multi-architecture builds
   - Use the updated docker-compose.yml with platform specification

2. **ContainerConfig KeyError**
   - Solution: Updated Dockerfile with proper image structure
   - Clean build: `docker-compose down && docker system prune -f && docker-compose up -d --build`

3. **Permission Issues**
   - Ensure Docker has proper permissions
   - Run: `sudo usermod -aG docker $USER` (Linux)

4. **Port Conflicts**
   - Check if ports 9090, 8000, or 3000 are in use
   - Modify ports in docker-compose.yml if needed

### Useful Commands
```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Clean up
docker-compose down -v
docker system prune -f
```

## Services

### Prometheus
- URL: http://localhost:9090
- Purpose: Metrics collection and storage
- Data: Stored in Docker volume `prometheus_data`

### Grafana
- URL: http://localhost:3000
- Default credentials: admin/admin
- Purpose: Metrics visualization and dashboards
- Data: Stored in Docker volume `grafana_data`

### Screeps Exporter
- Endpoint: http://localhost:8000/metrics
- Purpose: Collects data from Screeps API
- Logs: Available via `docker-compose logs screeps-prometheus`