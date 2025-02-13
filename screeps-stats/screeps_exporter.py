import os
import time
import json
import requests
import base64
import zlib

from prometheus_client import start_http_server, Gauge

############################
# Environment Variables
############################
SCREEPS_TOKEN = os.getenv('SCREEPS_TOKEN', '')
SCREEPS_SHARD = os.getenv('SCREEPS_SHARD', 'shard0')
SCREEPS_PATH  = os.getenv('SCREEPS_MEMORY_PATH', 'stats')
SCRAPE_INTERVAL = float(os.getenv('SCRAPE_INTERVAL', '15'))

############################
# Prometheus Gauges
############################

# CPU
cpu_bucket = Gauge("screeps_cpu_bucket", "Current CPU bucket")
cpu_used   = Gauge("screeps_cpu_used",   "CPU used in the last tick")
tick       = Gauge("screeps_tick",       "Current tick according to Memory.stats")

# GCL
gcl_level    = Gauge("screeps_gcl_level",           "GCL Level")
gcl_progress = Gauge("screeps_gcl_progress",        "GCL Progress")
gcl_total    = Gauge("screeps_gcl_progress_total",  "GCL Progress Total")
gcl_percent  = Gauge("screeps_gcl_progress_percent","GCL Progress Percent")
gcl_colonies = Gauge("screeps_gcl_colonies",        "Number of owned colonies")

# Creeps
creeps_total = Gauge("screeps_creeps_total", "Total number of creeps")

# Colony-level stats
colony_rcl_level    = Gauge("screeps_colony_rcl_level",    "RCL Level per colony", ["colony"])
colony_rcl_progress = Gauge("screeps_colony_rcl_progress", "RCL progress",         ["colony"])
colony_rcl_total    = Gauge("screeps_colony_rcl_progress_total","RCL progress total",["colony"])
colony_rcl_percent  = Gauge("screeps_colony_rcl_progress_percent","RCL progress percent",["colony"])

colony_remote_rooms   = Gauge("screeps_colony_remote_mining_rooms",   "Number of remote mining rooms", ["colony"])
colony_remote_sources = Gauge("screeps_colony_remote_mining_sources", "Number of remote mining sources", ["colony"])
colony_mining_sources = Gauge("screeps_colony_mining_sources",        "Sum of local+remote mining sources", ["colony"])

colony_spawn_status = Gauge("screeps_colony_spawn_status", "Spawn is actively spawning (1=Yes,0=No)", ["colony", "spawn"])

# Resources (global)
resource_amount = Gauge("screeps_resource_amount", "Total resources across all storages/terminals", ["resource"])

# Mining store percent
mining_store_percent = Gauge("screeps_mining_store_percent", "Store percent for remote mining rooms", ["room"])


def decode_gz_string(gz_string):
    """
    Takes a string like 'gz:H4sIAAAAAAAA...' from Screeps memory,
    strips 'gz:', base64-decodes it, and then zlib (gzip) decompresses.
    Returns a UTF-8 JSON string.
    """
    raw_data = gz_string[3:]  # remove "gz:"
    compressed = base64.b64decode(raw_data)
    # 16 + zlib.MAX_WBITS to handle gzip headers
    decompressed_bytes = zlib.decompress(compressed, 16 + zlib.MAX_WBITS)
    return decompressed_bytes.decode("utf-8")


def fetch_screeps_stats():
    """
    Fetch Screeps Memory[stats] from the official server,
    and decode if gzipped. Returns a Python dict of stats.
    """
    url = "https://screeps.com/api/user/memory"
    params = {
        "shard": SCREEPS_SHARD,
        "path": SCREEPS_PATH,
        "_token": SCREEPS_TOKEN
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()  # {'ok':1, 'data': 'gz:...base64...'} or plain JSON
        if "error" in data and data["error"]:
            print(f"Screeps API error: {data['error']}")
            return None
        
        memory_data = data["data"]

        # If data starts with "gz:", we must decode it
        if isinstance(memory_data, str) and memory_data.startswith("gz:"):
            decompressed_json = decode_gz_string(memory_data)
            return json.loads(decompressed_json)
        
        # Otherwise, it's plain JSON or an object
        if isinstance(memory_data, str):
            # If it doesn't start with 'gz:', assume it's regular JSON string
            return json.loads(memory_data)
        
        # If it's already an object/dict, just return it
        return memory_data
    
    except Exception as e:
        print(f"Error fetching Screeps data: {e}")
        return None


def update_metrics(stats):
    """
    Parse the Memory.stats object and set Prometheus metrics.
    Mirrors the shape of the Screeps code provided.
    """
    # 1. CPU
    cpu_info = stats.get("cpu", {})
    tick.set(cpu_info.get("tick", 0))
    cpu_bucket.set(cpu_info.get("bucket", 0))
    cpu_used.set(cpu_info.get("used", 0))

    # 2. GCL
    gcl_info = stats.get("gcl", {})
    gcl_level.set(gcl_info.get("level", 0))
    gcl_progress.set(gcl_info.get("progress", 0))
    gcl_total.set(gcl_info.get("progress_total", 0))
    gcl_percent.set(gcl_info.get("progress_percent", 0))
    gcl_colonies.set(gcl_info.get("colonies", 0))

    # 3. Creeps
    creeps_info = stats.get("creeps", {})
    creeps_total.set(creeps_info.get("total", 0))

    # 4. Colonies
    colonies = stats.get("colonies", {})
    colony_rcl_level.clear()
    colony_rcl_progress.clear()
    colony_rcl_total.clear()
    colony_rcl_percent.clear()
    colony_remote_rooms.clear()
    colony_remote_sources.clear()
    colony_mining_sources.clear()
    colony_spawn_status.clear()

    for colony_name, colony_data in colonies.items():
        # RCL info
        rcl_info = colony_data.get("rcl", {})
        colony_rcl_level.labels(colony=colony_name).set(rcl_info.get("level", 0))
        colony_rcl_progress.labels(colony=colony_name).set(rcl_info.get("progress", 0))
        colony_rcl_total.labels(colony=colony_name).set(rcl_info.get("progress_total", 0))
        colony_rcl_percent.labels(colony=colony_name).set(rcl_info.get("progress_percent", 0))

        # Remote mining
        remote_mining = colony_data.get("remote_mining", {})
        colony_remote_rooms.labels(colony=colony_name).set(remote_mining.get("rooms", 0))
        colony_remote_sources.labels(colony=colony_name).set(remote_mining.get("sources", 0))
        colony_mining_sources.labels(colony=colony_name).set(colony_data.get("mining_sources", 0))

        # Spawn statuses
        spawns_data = colony_data.get("spawns", {})
        for spawn_name, spawning_state in spawns_data.items():
            colony_spawn_status.labels(colony=colony_name, spawn=spawn_name).set(spawning_state)

    # 5. Resources (global)
    resources = stats.get("resources", {})
    resource_amount.clear()
    for res_name, amount in resources.items():
        resource_amount.labels(resource=res_name).set(amount)

    # 6. Mining store percent
    mining_data = stats.get("mining", {})
    mining_store_percent.clear()
    for mining_room, mining_info in mining_data.items():
        store_val = mining_info.get("store_percent",0)
        # If it's None, cast to 0 or skip
        if store_val is None:
            store_val = 0
        mining_store_percent.labels(room=mining_room).set(store_val)



def main():
    # Start Prometheus on port 8000
    start_http_server(8000)
    print("Screeps Exporter: Listening on port 8000 for Prometheus scraping.")

    while True:
        stats = fetch_screeps_stats()
        if stats:
            update_metrics(stats)
        time.sleep(SCRAPE_INTERVAL)


if __name__ == "__main__":
    main()
