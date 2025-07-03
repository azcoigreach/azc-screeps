# Highway Scouting & Remote Resource Collection System

## Overview

This system automatically scouts highway rooms and deploys harvest teams for remote resource collection. It integrates seamlessly with the existing Screeps AI codebase, leveraging existing creep roles, task assignments, and memory tracking systems.

## Features

### Highway Scouting
- **Level 7+ Colonies Only**: Only rooms with controller level 7 or higher send out scouts
- **Portal Exploration**: Scouts can explore through portals, but only within the same shard
- **Resource Detection**: Automatically finds deposits (FIND_DEPOSITS) and Power Banks
- **Memory Tracking**: Stores discovered opportunities with resource type, amount, decay time, and location
- **Configurable Intervals**: Re-scouting intervals are configurable (default: every 1000 ticks)

### Opportunity Evaluation
- **Path Calculation**: Calculates shortest path from eligible colonies to opportunities
- **Accessibility Validation**: Ensures route is viable and harvesting can complete before resource decay
- **Resource Prioritization**: Prioritizes based on proximity and resource value
- **Decay Time Analysis**: Only targets resources that can be harvested before expiration

### Harvest Team Deployment
- **Automated Spawning**: Deploys teams from closest eligible colony
- **Team Composition**: 
  - Highway Harvesters with appropriate WORK and CARRY parts
  - Highway Carriers to transport resources back to storage
  - Highway Scouts for exploration
- **Memory Integration**: Uses existing spawning system and memory structures
- **Automatic Cleanup**: Teams return or de-spawn once harvesting is complete

## Memory Structure

### Highway Opportunities
```javascript
Memory.hive.highway_opportunities = {
  "roomName": {
    colony: "colonyRoomName",
    last_scout: Game.time,
    opportunities: [
      {
        type: "deposit" | "power_bank",
        id: "objectId",
        resource: "resourceType",
        amount: number,
        decay: number,
        pos: { x: number, y: number, roomName: string },
        value: number
      }
    ]
  }
}
```

### Highway Harvest Sites
```javascript
Memory.sites.highway_harvest = {
  "highway_roomName_objectId": {
    colony: "colonyRoomName",
    target_room: "targetRoomName",
    opportunity_id: "objectId",
    opportunity: { /* opportunity object */ },
    path: ["room1", "room2", ...],
    created: Game.time,
    state: "spawning" | "traveling" | "harvesting" | "returning" | "complete",
    creeps: {
      harvester: number,
      carrier: number,
      scout: number
    }
  }
}
```

## New Creep Roles

### HighwayScout
- **Purpose**: Explore highway rooms and discover resources
- **Behavior**: Travels to target room, scans for resources, returns to colony
- **Memory**: `{ role: "highway_scout", colony: "colonyName", target_room: "targetRoom" }`

### HighwayHarvester
- **Purpose**: Harvest deposits and attack power banks
- **Behavior**: Travels to target, harvests/attacks resource, returns when complete
- **Memory**: `{ role: "highway_harvester", colony: "colonyName", harvest_site: "siteId", target_room: "targetRoom", opportunity_id: "objectId" }`

### HighwayCarrier
- **Purpose**: Transport harvested resources back to colony storage
- **Behavior**: Picks up resources, returns to colony when full, deposits in storage
- **Memory**: `{ role: "highway_carrier", colony: "colonyName", harvest_site: "siteId", target_room: "targetRoom", opportunity_id: "objectId" }`

## Console Commands

### highway.status()
Displays current status of highway system including:
- Number of discovered opportunities
- Number of active harvest sites
- Details of each opportunity and harvest site

### highway.clear_opportunities()
Clears all discovered opportunities from memory

### highway.clear_harvest_sites()
Clears all active harvest sites from memory

### highway.force_scout(roomName)
Forces spawning of a scout for a specific room

## Integration Points

### Existing Systems Used
- **Creep.prototype.travelToRoom**: Multi-room navigation with route logic
- **Task Assignment System**: Leverages existing task system for creeps
- **Memory Structures**: Uses existing room, resource, and task tracking
- **Factory System**: Resources are automatically processed after return
- **Spawn Request System**: Integrates with existing spawn management

### Pulse System
- **Highway Pulse**: Runs every 199-400 ticks (CPU-adaptive)
- **Highway Harvest Pulse**: Runs every 99-200 ticks (CPU-adaptive)

## Resource Value Calculation

Resources are prioritized based on their value:
- **Power**: 10x base value
- **Ops**: 8x base value  
- **High-tier Minerals** (utrium, lemergium, zynthium, keanium, ghodium_melt): 5x base value
- **Mid-tier Commodities** (oxidant, reductant, purifier, emanation, essence, spirit, catalyst): 3x base value
- **Other Resources**: 1x base value

## Safety Features

### Shard Restrictions
- Only explores portals within the same shard
- Prevents cross-shard travel accidents

### CPU Management
- Uses adaptive pulsing based on CPU bucket levels
- Respects existing CPU limits and optimization

### Resource Validation
- Validates resources still exist before harvesting
- Checks decay times to ensure completion before expiration
- Handles resource depletion gracefully

## Testing and Monitoring

### Console Commands
Use `help(highway)` to see all available commands

### Status Monitoring
```javascript
highway.status() // Check system status
```

### Manual Testing
```javascript
highway.force_scout("W1N1") // Force scout a specific room
```

## Future Enhancements

### Potential Improvements
1. **Enhanced Pathfinding**: Use Game.map.findRoute for better path calculation
2. **Combat Support**: Add optional combat creeps for dangerous areas
3. **Resource Processing**: Automatic processing of harvested commodities
4. **Market Integration**: Automatic selling of excess resources
5. **Multi-Shard Support**: Cross-shard portal exploration (if needed)

### Configuration Options
- Scout intervals
- Resource value multipliers
- Team composition preferences
- Priority thresholds

## Troubleshooting

### Common Issues
1. **No Scouts Spawning**: Ensure colony is level 7+ and has available spawn capacity
2. **Resources Not Found**: Check if room is visible or scout has reached target
3. **Harvest Teams Stuck**: Verify path is viable and resources still exist
4. **Memory Issues**: Use clear commands to reset system state

### Debug Commands
```javascript
highway.clear_opportunities() // Reset opportunities
highway.clear_harvest_sites() // Reset harvest sites
```

## Performance Considerations

- System uses CPU-adaptive pulsing to respect limits
- Memory cleanup happens automatically
- Expired opportunities are removed automatically
- Harvest sites are cleaned up when complete 