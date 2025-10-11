# Economy and Market: Factories, Labs, and Trading

**Summary**: This guide covers the bot's economic systems including factory production, lab reactions, terminal operations, market trading, and energy management across your empire.

**When you need this**: Setting up commodity production, managing lab reactions, trading resources on the market, or balancing energy across multiple rooms.

**Prerequisites**: At least one RCL 6+ room (for labs/terminals), RCL 7+ for factories.

---

## Overview of Economic Systems

The bot automates logistics but requires **you to set targets** for production and trading.

| System | RCL Req. | Purpose | Automation Level |
|--------|----------|---------|------------------|
| **Links** | 5+ | Energy distribution | ✅ Fully Automated |
| **Labs** | 6+ | Mineral reactions | ⚙️ You set targets, bot executes |
| **Terminals** | 6+ | Inter-room shipping, market trading | ⚙️ You set orders, bot fulfills |
| **Factories** | 7+ | Commodity production | ⚙️ You set targets, bot produces |
| **Market** | 6+ (terminal) | Buy/sell resources | ⚙️ You configure caps/thresholds |

---

## Factory Management (RCL 7+)

Factories produce **commodities** (batteries, wire, switches, etc.) from base resources and energy.

### Setting Production Targets

**Command**:
```javascript
factories.set_production("battery", 1000, 30);
```

**Parameters**:
- `commodity`: What to produce (e.g., "battery", "wire", "transistor", "microchip")
- `amount`: Target quantity (production stops when reached)
- `priority`: 1-100 (lower = higher priority, default 50)

**What happens**:
1. Bot checks COMMODITIES API for recipe
2. Assigns a factory to produce this commodity
3. Couriers load required components from storage
4. Factory operator manages production
5. Finished products moved to storage
6. **Production stops** when target amount reached

---

### Common Commodities & Recipes

| Commodity | Inputs | Uses | Priority Suggestion |
|-----------|--------|------|---------------------|
| **battery** | energy | Power spawns, level 1 commodity | 30 |
| **wire** | energy, utrium (U) | Level 2 commodities | 40 |
| **cell** | energy, lemergium (L) | Level 2 commodities | 40 |
| **alloy** | energy, zynthium (Z) | Level 2 commodities | 40 |
| **condensate** | energy, keanium (K) | Level 2 commodities | 40 |
| **switch** | wire + switch components | Level 3 commodities | 50 |
| **transistor** | switch + components | Level 4 commodities | 60 |
| **microchip** | transistor + components | Level 5 commodities | 70 |

**Pro Tip**: Start with level 1-2 commodities (battery, wire, cell, alloy) before advancing to higher tiers.

---

### Checking Factory Status

**Command**:
```javascript
factory_status();
```

**Example Output**:
```
=== FACTORY STATUS ===
Game Time: 12345678
CPU: 18.5 / 100

Factory Assignments:
  W1N1 Factory → battery (750 / 1000) [Priority 30]
  W2N2 Factory → wire (300 / 500) [Priority 40]

Production Queue:
  1. battery (250 remaining)
  2. wire (200 remaining)
  3. [IDLE] - No more targets

Industry Tasks (Courier/Operator):
  W1N1: Courier loading components for battery
  W2N2: Operator moving wire to storage
```

---

### Managing Production Targets

**Add More Targets**:
```javascript
factories.set_production("wire", 500, 40);
factories.set_production("cell", 500, 40);
factories.set_production("alloy", 500, 40);
```

**Clear a Specific Target**:
```javascript
factories.clear_production("battery");  // Stops battery production
```

**Clear All Targets**:
```javascript
factories.clear_all();  // Stops all factory production
```

**Renew Assignments** (if assignments seem stale):
```javascript
factories.renew_assignments();
```

---

### Factory Production Playbook

**Goal**: Set up basic commodity production for power spawns or market sales.

**Steps**:

1. **Verify Factories Exist**:
   ```javascript
   factory_status();  // Should show at least one factory
   ```

2. **Check Resource Availability**:
   ```javascript
   log.resources();  // Ensure you have base minerals (U, L, Z, K)
   ```

3. **Start Simple** (level 1 commodities):
   ```javascript
   factories.set_production("battery", 1000, 30);
   ```

4. **Monitor for 200 Ticks**:
   ```javascript
   factory_status();  // Check progress
   ```

5. **Expand Production** (add level 2 commodities):
   ```javascript
   factories.set_production("wire", 500, 40);
   factories.set_production("cell", 500, 40);
   ```

6. **Check CPU Impact**:
   ```javascript
   profiler.run(100);
   profiler.analyze();  // Verify factory operations aren't spiking CPU
   ```

**Expected CPU**: +0.5-1.5 CPU per active factory.

---

## Lab Reactions (RCL 6+)

Labs produce **boosted minerals** and **compounds** through reactions.

### Setting Lab Targets

**Command**:
```javascript
resources.lab_target("XGH2O", 5000, 10);
```

**Parameters**:
- `mineral`: Compound to produce (e.g., "XGH2O", "UH2O", "GH2O")
- `amount`: Target quantity
- `priority`: 1-100 (lower = higher priority)

**What happens**:
1. Bot calculates required reagents
2. Couriers ship reagents to labs via terminals (empire-wide)
3. Labs run reactions automatically
4. Finished compounds stored in terminal
5. Production stops when target reached

---

### Common Compounds & Uses

| Compound | Recipe | Use | Priority Suggestion |
|----------|--------|-----|---------------------|
| **GH2O** | G + H2O | +50% upgrade speed | 10 (high priority for GCL push) |
| **XGH2O** | GH2O + X + GH2O | +100% upgrade speed | 5 (very high priority) |
| **UH2O** | U + H2O | +50% attack | 20 |
| **LH2O** | L + H2O | +50% repair/build | 20 |
| **ZH2O** | Z + H2O | +50% dismantle | 30 |
| **KH2O** | K + H2O | +300% carry capacity | 15 |

**Pro Tip**: Start with basic boosts (GH2O, UH2O, LH2O) before crafting advanced compounds.

---

### Checking Lab Status

```javascript
log.resources();  // Shows mineral stockpiles and lab reactions
```

**Example Output**:
```
=== LAB REACTIONS ===
W1N1 Labs:
  Producing: GH2O (2,500 / 5,000)
  Reagents: G (500 available), H2O (1,000 available)

W2N2 Labs:
  Producing: UH2O (1,800 / 3,000)
  Reagents: U (800 available), H2O (1,500 available)
```

---

### Managing Lab Targets

**Add More Targets**:
```javascript
resources.lab_target("UH2O", 3000, 20);
resources.lab_target("LH2O", 3000, 20);
```

**Clear a Target** (no console command yet):
- Manually edit `Memory.resources.labs.targets` or wait for target to complete

---

## Terminal Operations (RCL 6+)

Terminals enable:
- **Inter-room resource transfers** (your rooms or to allies)
- **Market trading** (buy/sell resources)
- **Automatic energy balancing** across your empire

---

### Internal Resource Transfers

**Send Energy to Another Room**:
```javascript
resources.send("energy_transfer", "W1N1", "W2N2", "energy", 50000);
```

**Send Minerals to an Ally**:
```javascript
resources.send("gift_to_ally", "W1N1", "AllyRoom", "U", 5000);
```

**Parameters**:
- `order_name`: Your label for this transfer (unique ID)
- `room_from`: Source room (must have terminal)
- `room_to`: Destination room (can be your room or ally's room)
- `resource`: Resource type ("energy", "U", "L", etc.)
- `amount`: Quantity to send

**What happens**:
- Order stored in Memory
- Courier loads terminal in `room_from`
- Terminal sends resources to `room_to`
- Order removed when complete

---

### Automatic Energy Overflow

**Set Overflow Cap**:
```javascript
resources.overflow_cap(400000);  // Overflow energy above 400k
```

**What happens**:
- Any room with > 400k energy sends excess to the room with the **least energy**
- Balances energy across your empire automatically
- Prevents wasted energy in capped storage

**Use case**: Established colonies send energy to new colonies automatically.

---

## Market Trading

### Automatic Selling (Excess Resources)

**Set Market Cap**:
```javascript
resources.market_cap("U", 10000);  // Sell U above 10,000 units
```

**What happens**:
- When any room exceeds 10k U, bot sells excess to the **highest bidder**
- Only sells to existing buy orders (doesn't create sell orders)
- Continues until U drops below 10k

**Common Use Case**:
```javascript
// Auto-sell excess base minerals
resources.market_cap("U", 10000);
resources.market_cap("L", 10000);
resources.market_cap("K", 10000);
resources.market_cap("Z", 10000);
resources.market_cap("O", 10000);
resources.market_cap("H", 10000);
```

---

### Emergency Energy Buying

**Set Energy Threshold**:
```javascript
resources.set_energy_threshold(50000);
```

**What happens**:
- If any room drops below 50k energy, bot **buys energy** from the market
- Uses the cheapest available sell order
- Spends credits to ensure colonies don't starve

**Use case**: Safety net for energy crises (attacks, spawn overload, remote mine failures).

---

### Manual Market Trading

**Buy Energy** (or any resource):
```javascript
resources.market_buy("order_name", "market_order_id", "W1N1", 10000);
```

**Sell Minerals**:
```javascript
resources.market_sell("order_name", "market_order_id", "W1N1", 5000);
```

**How to Get Order IDs**:
1. Open Screeps market interface (in-game or API)
2. Find a buy/sell order
3. Copy the order ID
4. Use in the command above

---

### Checking Market Status

**Command**:
```javascript
market_status();
```

**Example Output**:
```
=== MARKET STATUS ===
Credits: 125,430
Energy Threshold: 50,000

Active Orders:
  - Selling U from W1N1 (2,500 units @ 0.15 credits/unit)
  - Buying energy to W2N2 (10,000 units @ 0.05 credits/unit)

Room Energy Levels:
  W1N1: 245,000 ✅ (above threshold)
  W2N2: 38,000 ⚠️ (below threshold, buying energy)
```

**Credits Balance**:
```javascript
resources.credits();
```

Shows your current market credits.

---

## Energy Management Best Practices

### 1. Set Overflow Caps Early

**As soon as you have 2+ rooms with terminals**:
```javascript
resources.overflow_cap(300000);  // RCL 6-7
resources.overflow_cap(500000);  // RCL 8
```

**Why**: Prevents energy waste, keeps new colonies supplied.

---

### 2. Configure Emergency Energy Threshold

**Set a safety net**:
```javascript
resources.set_energy_threshold(50000);  // RCL 5-6
resources.set_energy_threshold(100000); // RCL 7-8
```

**Why**: Prevents colony collapse from energy starvation.

---

### 3. Sell Excess Base Minerals

**Set caps for common minerals**:
```javascript
resources.market_cap("U", 15000);
resources.market_cap("L", 15000);
resources.market_cap("K", 15000);
resources.market_cap("Z", 15000);
```

**Why**: Generates credits, frees up storage for advanced compounds.

---

### 4. Monitor Credits Regularly

**Check credits weekly**:
```javascript
resources.credits();
```

**If credits < 10k**: Reduce auto-buying or increase selling.

**If credits > 100k**: You're in good shape! Consider buying rare minerals for labs.

---

## Economy Optimization Playbook

### Playbook 1: Bootstrap Factory Production (RCL 7+)

**Goal**: Start producing basic commodities.

**Steps**:

1. **Check Mineral Stockpiles**:
   ```javascript
   log.resources();  // Ensure you have U, L, Z, K
   ```

2. **Start Battery Production**:
   ```javascript
   factories.set_production("battery", 1000, 30);
   ```

3. **Monitor for 300 Ticks**:
   ```javascript
   factory_status();  // Check progress
   ```

4. **Add Level 2 Commodities**:
   ```javascript
   factories.set_production("wire", 500, 40);  // Needs U
   factories.set_production("cell", 500, 40);  // Needs L
   ```

5. **Check CPU**:
   ```javascript
   profiler.run(100);
   profiler.analyze();
   ```

**Expected Outcome**: +500-1000 commodities produced, +1-2 CPU usage.

---

### Playbook 2: Set Up Lab Boost Production

**Goal**: Produce GH2O for fast RCL upgrades.

**Steps**:

1. **Check Ghodium (G) Availability**:
   ```javascript
   log.resources();  // Need G + H2O
   ```

2. **Set Lab Target**:
   ```javascript
   resources.lab_target("GH2O", 5000, 10);
   ```

3. **Monitor Lab Status**:
   ```javascript
   log.resources();  // Check reaction progress
   ```

4. **Boost Upgraders** (manual, not automated):
   - Manually pick up GH2O and boost upgraders
   - Or use console commands if available (check `help("resources")`)

**Expected Outcome**: 5,000 GH2O produced in ~500-1000 ticks.

---

### Playbook 3: Configure Empire-Wide Energy Management

**Goal**: Auto-balance energy and prevent shortages.

**Steps**:

1. **Set Overflow Cap**:
   ```javascript
   resources.overflow_cap(400000);
   ```

2. **Set Emergency Threshold**:
   ```javascript
   resources.set_energy_threshold(50000);
   ```

3. **Verify Terminal Connectivity**:
   ```javascript
   log.resources();  // Check all rooms have terminals (RCL 6+)
   ```

4. **Test Transfer** (optional):
   ```javascript
   resources.send("test_transfer", "W1N1", "W2N2", "energy", 10000);
   ```

5. **Monitor Market Status**:
   ```javascript
   market_status();
   ```

**Expected Outcome**: Energy auto-balances across rooms, no manual transfers needed.

---

## Troubleshooting

### Problem: Factory Not Producing

**Causes**:
- No factory in room (RCL 7+)
- Missing components in storage
- Courier/operator creeps dead or idle
- Factory assignment not set

**Solutions**:
1. Check factory existence: `factory_status()`
2. Verify components: `log.resources()`
3. Check creep count: `log.population()` (need couriers and operators)
4. Renew assignments: `factories.renew_assignments()`

---

### Problem: Lab Reactions Not Running

**Causes**:
- No labs (RCL 6+)
- Missing reagents
- Couriers not shipping reagents between rooms
- Lab assignment not configured

**Solutions**:
1. Check lab count: `log.can_build()` (need at least 3 labs for reactions)
2. Verify reagents: `log.resources()`
3. Check courier population: `log.population()`
4. Manually send reagents via terminal if needed:
   ```javascript
   resources.send("reagent_transfer", "W1N1", "W2N2", "G", 1000);
   ```

---

### Problem: Market Orders Not Executing

**Causes**:
- Insufficient credits
- No terminal in room
- Courier not loading terminal
- Order ID invalid or expired

**Solutions**:
1. Check credits: `resources.credits()`
2. Verify terminal exists: `log.can_build()`
3. Check courier count: `log.population()`
4. Re-check order ID on market (may have been fulfilled by someone else)

---

### Problem: Energy Not Balancing Between Rooms

**Causes**:
- Overflow cap not set
- Terminals missing or broken
- Couriers not spawning
- Energy below overflow threshold in all rooms

**Solutions**:
1. Set overflow cap: `resources.overflow_cap(300000)`
2. Verify terminals: `log.resources()`
3. Check couriers: `log.population()`
4. Manually transfer energy as a temporary fix:
   ```javascript
   resources.send("manual_balance", "W1N1", "W2N2", "energy", 50000);
   ```

---

## Economy Quick Reference

```javascript
// === FACTORIES ===
factories.set_production("battery", 1000, 30);  // Produce 1000 batteries
factories.clear_production("battery");          // Stop battery production
factories.clear_all();                          // Stop all production
factory_status();                               // Check factory status

// === LABS ===
resources.lab_target("GH2O", 5000, 10);         // Produce 5000 GH2O

// === TERMINALS ===
resources.send("order", "W1N1", "W2N2", "energy", 50000);  // Transfer energy
resources.overflow_cap(400000);                             // Auto-balance energy
resources.set_energy_threshold(50000);                      // Emergency buy threshold

// === MARKET ===
resources.market_cap("U", 10000);                           // Auto-sell U above 10k
resources.market_buy("order", "order_id", "W1N1", 10000);  // Buy resources
resources.market_sell("order", "order_id", "W1N1", 5000);  // Sell resources
market_status();                                            // Market overview
resources.credits();                                        // Check credits
```

---

## Next Steps

- **Defend Your Economy**: [Defense and Security](defense-and-security.md)
- **Optimize Performance**: [Performance and CPU](performance-and-cpu.md)
- **Advanced Configuration**: [Configuration](configuration.md)

---

**Your economy is now self-sustaining!** 💰

