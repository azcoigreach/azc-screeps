# Autonomous Screeps AI - Development Directives

## 🎯 Primary Goals

### 1. Autonomous Territory Expansion
- **Objective**: Automatically expand bot's territory without user intervention
- **Scope**: Scout, evaluate, and claim new rooms based on strategic value
- **Success Criteria**: Bot can identify and claim valuable rooms independently

### 2. Intelligent Room Scouting & Evaluation
- **Objective**: Scout nearby rooms and determine their usefulness
- **Metrics**: Resource availability, strategic position, threat assessment
- **Output**: Prioritized list of target rooms for expansion

### 3. Flag-Based Manual Control System
- **Objective**: Use flags for user override and high-level directives
- **Flag Types**:
  - `colonize_[room]` → Send claimer + support creeps to take room
  - `remote_[room]` → Set up long-distance mining operation
  - `attack_[room]` → Spawn military creeps for offensive action
  - `boost_[room]` → Apply combat boosts to creeps
  - `trade_[room]` → Establish trade routes

### 4. Strategic Decision Making
- **Objective**: Make autonomous decisions about expand/mine/attack/boost/trade
- **Input**: Current resources, threats, opportunities, room states
- **Output**: Prioritized action queue

## 🏗️ Architecture Overview

### Phase 1: Flag Directive System (Current Focus)
```
FlagManager
├── Flag Detection & Parsing
├── Directive Handlers
│   ├── ColonizeHandler
│   ├── RemoteMiningHandler
│   ├── AttackHandler
│   ├── BoostHandler
│   └── TradeHandler
└── Memory Management
    ├── Flag Tracking
    ├── Directive Status
    └── Cleanup Logic
```

### Phase 2: Autonomous AI Director
```
Director
├── Strategic Analysis
├── Room Evaluation
├── Threat Assessment
├── Resource Management
└── Action Prioritization
```

### Phase 3: Full Autonomous Operation
```
AutonomousAI
├── Territory Management
├── Economic Optimization
├── Military Strategy
├── Diplomatic Relations
└── Long-term Planning
```

## 📋 Implementation Roadmap

### Phase 1: Flag System (Week 1-2)
- [ ] Create `FlagManager` module
- [ ] Implement flag detection and parsing
- [ ] Build directive handlers for each flag type
- [ ] Add memory management for flag tracking
- [ ] Implement cleanup logic for completed directives

### Phase 2: Autonomous Director (Week 3-4)
- [ ] Create `Director` class for strategic decision making
- [ ] Implement room evaluation algorithms
- [ ] Add threat assessment capabilities
- [ ] Build resource optimization logic
- [ ] Create action prioritization system

### Phase 3: Full Autonomy (Week 5-6)
- [ ] Integrate all systems into main loop
- [ ] Add diplomatic and trade capabilities
- [ ] Implement long-term strategic planning
- [ ] Add performance monitoring and optimization
- [ ] Create user override and safety systems

## 🔧 Technical Specifications

### Flag Directive System
```javascript
// Flag naming convention
colonize_E54S29    // Colonize specific room
remote_E53S28      // Remote mining operation
attack_E52S27      // Military action
boost_E51S26       // Combat boost application
trade_E50S25       // Trade route establishment
```

### Memory Structure
```javascript
Memory.flags = {
  [flagName]: {
    directive: 'colonize|remote|attack|boost|trade',
    targetRoom: 'E54S29',
    status: 'pending|in_progress|completed|failed',
    assignedCreeps: [],
    createdAt: Game.time,
    completedAt: null
  }
}
```

### Handler Interface
```javascript
class DirectiveHandler {
  canHandle(flagName) { /* return boolean */ }
  parseDirective(flagName) { /* return directive object */ }
  execute(directive) { /* execute the directive */ }
  cleanup(directive) { /* cleanup after completion */ }
}
```

## 🎯 Success Metrics

### Phase 1 Metrics
- [ ] Flag detection works within 1 tick
- [ ] Directive parsing accuracy > 95%
- [ ] Handler execution success rate > 90%
- [ ] Memory cleanup prevents bloat

### Phase 2 Metrics
- [ ] Room evaluation accuracy > 80%
- [ ] Strategic decision quality > 75%
- [ ] Resource allocation efficiency > 85%

### Phase 3 Metrics
- [ ] Autonomous expansion rate > 2 rooms/day
- [ ] Economic growth rate > 15%/day
- [ ] Military effectiveness > 80% win rate
- [ ] System stability > 99% uptime

## 🚨 Safety & Override Systems

### User Override Capabilities
- Emergency stop flags
- Priority override system
- Manual control restoration
- Performance monitoring alerts

### Safety Checks
- Resource threshold monitoring
- Threat level assessment
- Backup plan activation
- Graceful degradation

## 📝 Development Notes

### Current Status
- Starting Phase 1: Flag Directive System
- Need to integrate with existing `Control` system
- Must maintain compatibility with current bot functionality

### Next Steps
1. Create `FlagManager` module
2. Implement basic flag detection
3. Build first directive handler (colonize)
4. Test with simple flag placement
5. Iterate and expand functionality

### Dependencies
- Existing `Control` system
- Current creep role definitions
- Memory management patterns
- Room position utilities

---

**Last Updated**: Initial creation
**Current Phase**: Phase 1 - Flag Directive System
**Next Milestone**: Basic flag detection and colonize handler 