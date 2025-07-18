/* ***********************************************************
 *	[sec02a] DEFINITIONS: POPULATIONS
 * *********************************************************** */

 Population_Industry =
 { courier: { level: 6, amount: 1 } };

Population_Colonization =
 { colonizer: { level: 6, amount: 1, body: "reserver_at", scale: false } };


Population_Colony = {
 Standalone: {
     1: { worker: { level: 1, amount: 5, body: "worker_at" } },
     2: { worker: { level: 2, amount: 5, body: "worker_at" } },
     3: { worker: { level: 3, amount: 6, body: "worker_at" } },
     4: { worker: { level: 4, amount: 6, body: "worker_at" } },
     5: { worker: { level: 4, amount: 6, body: "worker_at" }, upgrader: { level: 5, amount: 1, body: "upgrader" } },
     6: { worker: { level: 4, amount: 4 }, upgrader: { level: 6, amount: 1, body: "upgrader" } },
     7: { worker: { level: 7, amount: 4 }, upgrader: { level: 7, amount: 1, body: "upgrader" } },
     8: { worker: { level: 7, amount: 3 }, upgrader: { level: 8, amount: 1, body: "upgrader" } }
 },

 Assisted: {
     1: { worker: { level: 3, amount: 4, body: "worker_at" } },
     2: { worker: { level: 3, amount: 4, body: "worker_at" } },
     3: { worker: { level: 4, amount: 6, body: "worker_at" } },
     4: { worker: { level: 5, amount: 6, body: "worker_at" } },
     5: { worker: { level: 6, amount: 6, body: "worker_at" }, upgrader: { level: 5, amount: 1, body: "upgrader" } },
     6: { worker: { level: 6, amount: 5 }, upgrader: { level: 6, amount: 1, body: "upgrader" } },
     7: { worker: { level: 7, amount: 4 }, upgrader: { level: 7, amount: 1, body: "upgrader" } },
     8: { worker: { level: 7, amount: 3 }, upgrader: { level: 8, amount: 1, body: "upgrader" } }
 }
};


Population_Mining = {
 S1: {
     1: { miner: { level: 1, amount: 2, body: "worker_at" } },
     2: {
         miner: { level: 2, amount: 2, body: "worker_at" },
         burrower: { level: 2, amount: 1, body: "burrower_at" },
         carrier: { level: 2, amount: 2, body: "carrier_at"}
     },
     3: {
         miner: { level: 2, amount: 2, body: "worker_at" },
         burrower: { level: 2, amount: 1, body: "burrower_at" },
         carrier: { level: 2, amount: 2, body: "carrier_at" }
     },
     4: {
         burrower: { level: 4, amount: 1, body: "burrower_at" },
         carrier: { level: 3, amount: 2, body: "carrier_at" }
     },
     5: {
         burrower: { level: 5, amount: 1, body: "burrower_at" },
         carrier: { level: 4, amount: 2, body: "carrier_at" }
     },
     6: {
         burrower: { level: 6, amount: 1 },
         carrier: { level: 5, amount: 2 },
         extractor: { level: 4, amount: 2 }
     },
     7: {
         burrower: { level: 7, amount: 1 },
         carrier: { level: 6, amount: 2 },
         extractor: { level: 7, amount: 2 }
     },
     8: {
         burrower: { level: 8, amount: 1 },
         carrier: { level: 7, amount: 2 },
         extractor: { level: 8, amount: 2 }
     }
 },

 S2: {
     1: { miner: { level: 1, amount: 2, body: "worker_at" } },
     2: {
         miner: { level: 2, amount: 2, body: "worker_at" },
         burrower: { level: 2, amount: 2, body: "burrower_at" },
         carrier: { level: 2, amount: 3, body: "carrier_at" }
     },
     3: {
         miner: { level: 2, amount: 2, body: "worker_at" },
         burrower: { level: 2, amount: 2, body: "burrower_at" },
         carrier: { level: 2, amount: 3, body: "carrier_at" }
     },
     4: {
         burrower: { level: 4, amount: 2, body: "burrower_at" },
         carrier: { level: 3, amount: 3, body: "carrier_at" }
     },
     5: {
         burrower: { level: 5, amount: 2, body: "burrower_at" },
         carrier: { level: 4, amount: 3, body: "carrier_at" }
     },
     6: {
         burrower: { level: 6, amount: 2 },
         carrier: { level: 5, amount: 3 },
         extractor: { level: 4, amount: 2 }
     },
     7: {
         burrower: { level: 7, amount: 2 },
         carrier: { level: 6, amount: 3 },
         extractor: { level: 7, amount: 2 }
     },
     8: {
         burrower: { level: 8, amount: 2 },
         carrier: { level: 7, amount: 3 },
         extractor: { level: 8, amount: 2 }
     }
 },
 R0: {
     1: { multirole: { level: 1, amount: 1 } },
     2: { multirole: { level: 2, amount: 1 } },
     3: { multirole: { level: 3, amount: 1 } },
     4: { multirole: { level: 4, amount: 1 } },
     5: { multirole: { level: 5, amount: 1 } },
     6: { multirole: { level: 5, amount: 1 } },
     7: { multirole: { level: 6, amount: 1 } },
     8: { multirole: { level: 6, amount: 1 } }
 },

 R1: {
     1: { miner: { level: 1, amount: 1, body: "worker_at" } },
     2: {
         burrower: { level: 2, amount: 2, body: "burrower_at" },
         carrier: { level: 2, amount: 2, body: "carrier_at" },
         multirole: { level: 2, amount: 1, body: "worker_at" }
     },
     3: {
         burrower: { level: 2, amount: 2, body: "burrower_at" },
         carrier: { level: 2, amount: 2, body: "carrier_at" },
         multirole: { level: 2, amount: 1, body: "worker_at" }
     },
     4: {
         burrower: { level: 3, amount: 1, body: "burrower_at" },
         carrier: { level: 3, amount: 2, body: "carrier_at" },
         multirole: { level: 3, amount: 1, body: "worker_at" },
         reserver: { level: 3, amount: 2, body: "reserver_at" }
     },
     5: {
         burrower: { level: 5, amount: 1, body: "burrower_at" },
         carrier: { level: 4, amount: 2, body: "carrier_at" },
         multirole: { level: 4, amount: 1, body: "worker_at" },
         reserver: { level: 4, amount: 2, body: "reserver_at" }
     },
     6: {
         burrower: { level: 6, amount: 1, body: "burrower_at" },
         carrier: { level: 5, amount: 2, body: "carrier_at" },
         multirole: { level: 4, amount: 1, body: "worker_at" },
         reserver: { level: 4, amount: 2, body: "reserver_at" }
     },
     7: {
         burrower: { level: 7, amount: 1, body: "burrower_at" },
         carrier: { level: 6, amount: 2, body: "carrier_at" },
         multirole: { level: 5, amount: 1, body: "worker_at" },
         reserver: { level: 7, amount: 1, body: "reserver_at" }
     },
     8: {
         burrower: { level: 8, amount: 1, body: "burrower_at" },
         carrier: { level: 7, amount: 2, body: "carrier_at" },
         multirole: { level: 5, amount: 1, body: "worker_at" },
         reserver: { level: 8, amount: 1, body: "reserver_at" }
     }
 },

 R2: {
     1: { miner: { level: 1, amount: 1, body: "worker_at" } },
     2: {
         burrower: { level: 2, amount: 2, body: "burrower_at" },
         carrier: { level: 2, amount: 4, body: "carrier_at" },
         multirole: { level: 2, amount: 1, body: "worker_at" }
     },
     3: {
         burrower: { level: 2, amount: 2, body: "burrower_at" },
         carrier: { level: 2, amount: 4, body: "carrier_at" },
         multirole: { level: 2, amount: 1, body: "worker_at" }
     },
     4: {
         burrower: { level: 4, amount: 1, body: "burrower_at" },
         carrier: { level: 3, amount: 4, body: "carrier_at" },
         multirole: { level: 3, amount: 1, body: "worker_at" },
         reserver: { level: 3, amount: 2, body: "reserver_at" }
     },
     5: {
         burrower: { level: 5, amount: 1, body: "burrower_at" },
         carrier: { level: 4, amount: 3, body: "carrier_at" },
         multirole: { level: 4, amount: 1, body: "worker_at" },
         reserver: { level: 4, amount: 2, body: "reserver_at" }
     },
     6: {
         burrower: { level: 6, amount: 1, body: "burrower_at" },
         carrier: { level: 5, amount: 3, body: "carrier_at" },
         multirole: { level: 4, amount: 1, body: "worker_at" },
         reserver: { level: 4, amount: 2, body: "reserver_at" }
     },
     7: {
         burrower: { level: 7, amount: 1, body: "burrower_at" },
         carrier: { level: 6, amount: 3, body: "carrier_at" },
         multirole: { level: 5, amount: 1, body: "worker_at" },
         reserver: { level: 7, amount: 1, body: "reserver_at" }
     },
     8: {
         burrower: { level: 8, amount: 1, body: "burrower_at" },
         carrier: { level: 7, amount: 3, body: "carrier_at" },
         multirole: { level: 5, amount: 1, body: "worker_at" },
         reserver: { level: 8, amount: 1, body: "reserver_at" }
     }
 },

 R3: {	// Sector center mining rooms
     1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {},
     7: {
         burrower: { level: 7, amount: 2, body: "burrower_at" },
         carrier: { level: 6, amount: 4, body: "carrier_at" },
         extractor: { level: 7, amount: 2, body: "extractor_rem" },
         multirole: { level: 5, amount: 1, body: "worker_at" }
     },
     8: {
         burrower: { level: 8, amount: 2, body: "burrower_at" },
         carrier: { level: 7, amount: 4, body: "carrier_at" },
         extractor: { level: 8, amount: 2, body: "extractor_rem" },
         multirole: { level: 5, amount: 1, body: "worker_at" }
     }
 },

 SK: {
     paladin: { level: 8, amount: 2, scale: false },
     healer: { level: 4, amount: 1, scale: false },
     burrower: { level: 7, amount: 2, body: "burrower_at" },
     carrier: { level: 6, amount: 4, body: "carrier_at" },
     extractor: { level: 7, amount: 2, body: "extractor_rem" }
 },

 SK_Alt: {
     ranger: { level: 8, amount: 2, scale: false },
     healer: { level: 4, amount: 1, scale: false },
     burrower: { level: 7, amount: 2, body: "burrower_at" },
     carrier: { level: 6, amount: 4, body: "carrier_at" },
     extractor: { level: 7, amount: 2, body: "extractor_rem" }
 }
};