import os
import time
import json
import requests
from prometheus_client import start_http_server, Gauge

SCREEPS_TOKEN = os.getenv('SCREEPS_TOKEN', '')  # Screeps API token
SCREEPS_SHARD = os.getenv('SCREEPS_SHARD', 'shard3')
SCREEPS_PATH  = os.getenv('SCREEPS_MEMORY_PATH', 'myStats')
SCRAPE_INTERVAL = float(os.getenv('SCRAPE_INTERVAL', '15'))  # seconds

# Prometheus Gauges (add more for different metrics)
cpu_gauge = Gauge('screeps_cpu_used', 'CPU used by Screeps code')
gcl_gauge = Gauge('screeps_gcl_progress', 'GCL progress')

def fetch_screeps_stats():
    """Fetch the Screeps Memory[path] from the official API."""
    url = "https://screeps.com/api/user/memory"
    params = {
        "shard": SCREEPS_SHARD,
        "path": SCREEPS_PATH,
        "token": SCREEPS_TOKEN
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()  # { "data": ..., "error": ...? }
        if "error" in data and data["error"]:
            print(f"Screeps API error: {data['error']}")
            return None
        # data["data"] might be a JSON string
        memory_data = data["data"]
        if isinstance(memory_data, str):
            memory_data = json.loads(memory_data)
        return memory_data
    except Exception as e:
        print(f"Error fetching Screeps data: {e}")
        return None

def update_metrics(stats_dict):
    """Update Prometheus metrics from the Screeps stats dict."""
    # Example usage: if your memory stats have { cpu: 4.5, gclProgress: 1234 }
    cpu_value = stats_dict.get('cpu')
    gcl_value = stats_dict.get('gclProgress')

    if cpu_value is not None:
        cpu_gauge.set(cpu_value)
    if gcl_value is not None:
        gcl_gauge.set(gcl_value)

if __name__ == "__main__":
    # Start a Prometheus metrics server on port 8000
    start_http_server(8000)
    print("Screeps Exporter: Listening on port 8000 for Prometheus scraping.")
    while True:
        stats = fetch_screeps_stats()
        if stats:
            update_metrics(stats)
        time.sleep(SCRAPE_INTERVAL)
