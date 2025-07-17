/* ***********************************************************
 *	MINING EFFICIENCY TRACKING
 * *********************************************************** */

global.MiningEfficiency = {
    
    // Initialize mining efficiency tracking for a room
    initRoom: function(roomName) {
        if (!Memory.mining_efficiency) {
            Memory.mining_efficiency = {};
        }
        if (!Memory.mining_efficiency[roomName]) {
            Memory.mining_efficiency[roomName] = {
                energy_collected: 0,
                energy_delivered: 0,
                last_reset: Game.time,
                tick_windows: {},
                performance_metrics: {
                    current_rate: 0,
                    target_rate: 10, // 3000 energy per 300 ticks = 10 energy per tick
                    efficiency_ratio: 0
                }
            };
        }
    },
    
    // Track energy collection by miners/burrowers
    trackEnergyCollection: function(roomName, creepName, amount) {
        this.initRoom(roomName);
        let data = Memory.mining_efficiency[roomName];
        
        data.energy_collected += amount;
        
        // Update 300-tick window tracking
        let currentWindow = Math.floor(Game.time / 300);
        if (!data.tick_windows[currentWindow]) {
            data.tick_windows[currentWindow] = {
                collected: 0,
                delivered: 0,
                start_tick: currentWindow * 300
            };
        }
        data.tick_windows[currentWindow].collected += amount;
        
        // Clean up old windows (keep only last 10 windows for history)
        let oldWindows = Object.keys(data.tick_windows).filter(w => 
            parseInt(w) < currentWindow - 10
        );
        oldWindows.forEach(w => delete data.tick_windows[w]);
    },
    
    // Track energy delivery to spawns/storage
    trackEnergyDelivery: function(roomName, creepName, amount, target) {
        this.initRoom(roomName);
        let data = Memory.mining_efficiency[roomName];
        
        data.energy_delivered += amount;
        
        // Update current 300-tick window
        let currentWindow = Math.floor(Game.time / 300);
        if (!data.tick_windows[currentWindow]) {
            data.tick_windows[currentWindow] = {
                collected: 0,
                delivered: 0,
                start_tick: currentWindow * 300
            };
        }
        data.tick_windows[currentWindow].delivered += amount;
        
        // Track delivery targets
        if (!data.delivery_targets) {
            data.delivery_targets = {};
        }
        if (!data.delivery_targets[target]) {
            data.delivery_targets[target] = 0;
        }
        data.delivery_targets[target] += amount;
    },
    
    // Calculate current efficiency metrics
    calculateEfficiency: function(roomName) {
        this.initRoom(roomName);
        let data = Memory.mining_efficiency[roomName];
        
        let currentWindow = Math.floor(Game.time / 300);
        let currentWindowData = data.tick_windows[currentWindow];
        
        if (currentWindowData) {
            let ticksInWindow = (Game.time % 300) + 1;
            let currentRate = currentWindowData.delivered / ticksInWindow;
            data.performance_metrics.current_rate = currentRate;
            data.performance_metrics.efficiency_ratio = currentRate / data.performance_metrics.target_rate;
        }
        
        return data.performance_metrics;
    },
    
    // Get recent performance summary
    getPerformanceSummary: function(roomName) {
        this.initRoom(roomName);
        let data = Memory.mining_efficiency[roomName];
        
        let recentWindows = Object.keys(data.tick_windows)
            .sort((a, b) => parseInt(b) - parseInt(a))
            .slice(0, 5);
        
        let summary = {
            room: roomName,
            recent_windows: [],
            average_efficiency: 0,
            total_collected: data.energy_collected,
            total_delivered: data.energy_delivered
        };
        
        let totalEfficiency = 0;
        recentWindows.forEach(windowKey => {
            let window = data.tick_windows[windowKey];
            let efficiency = window.delivered / 3000; // Target: 3000 energy per 300 ticks
            summary.recent_windows.push({
                window: parseInt(windowKey),
                collected: window.collected,
                delivered: window.delivered,
                efficiency: efficiency
            });
            totalEfficiency += efficiency;
        });
        
        summary.average_efficiency = totalEfficiency / recentWindows.length;
        return summary;
    },
    
    // Reset tracking data (useful for testing)
    resetRoom: function(roomName) {
        if (Memory.mining_efficiency && Memory.mining_efficiency[roomName]) {
            delete Memory.mining_efficiency[roomName];
        }
    }
};