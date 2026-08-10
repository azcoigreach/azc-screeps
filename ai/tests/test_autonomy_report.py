from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from commander.autonomy import AutonomyController
from commander.history import HistoryStore
from commander.report import build_report
from commander.schemas import StrategicOrder, Telemetry
from tests.helpers import telemetry_payload


class FakeTransport:
    def __init__(self, history: HistoryStore, tick: int) -> None:
        self.history = history
        self.tick = tick
        self.sent: list[StrategicOrder] = []

    def send_safe_command(self, action, parameters=None, *, reason):
        order = StrategicOrder(
            schemaVersion=1, id=f"test-{len(self.sent)}", createdTick=self.tick,
            expiresTick=self.tick + 1000, action=action, parameters=parameters or {}, reason=reason,
        )
        self.history.record_command(order, "sent")
        self.sent.append(order)
        return order


class AutonomyReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.history = HistoryStore(Path(self.temp.name) / "history.db")

    def tearDown(self) -> None:
        self.history.close()
        self.temp.cleanup()

    def test_deterministic_maintenance_selects_obvious_diagnostic_without_llm(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        payload["operations"]["remoteMining"][0]["diagnostics"] = [
            {"diagnostic": "RESERVATION_EXPIRING", "severity": "HIGH", "evidence": {"ticksToEnd": 100}}
        ]
        payload["operations"]["remoteMining"][0]["reasons"] = ["RESERVATION_EXPIRING"]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertIsNotNone(order)
        self.assertEqual(order.action, "ENSURE_REMOTE_RESERVATION")
        self.assertEqual(order.parameters, {"room": "W1N2"})
        self.assertEqual(self.history.recent_operations()[0]["action"], "ENSURE_REMOTE_RESERVATION")

    def test_active_remote_objective_prevents_duplicate_maintenance_order(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        remote = payload["operations"]["remoteMining"][0]
        remote["diagnostics"] = [{
            "diagnostic": "RESERVATION_EXPIRING", "severity": "HIGH", "evidence": {"ticksToEnd": 100}
        }]
        remote["reasons"] = ["RESERVATION_EXPIRING"]
        remote["objectives"] = ["reservation"]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        self.assertIsNone(AutonomyController(self.history, transport).run(telemetry))
        self.assertEqual(transport.sent, [])

    def test_critical_recovery_suppresses_routine_remote_maintenance(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        payload["empireLoad"] = {
            "state": "CRITICAL", "growthVeto": True,
            "homePopulation": {"satisfaction": 12.5, "criticalSatisfaction": 50},
            "spawnPressure": {"queueDepth": 4},
        }
        remote = payload["operations"]["remoteMining"][0]
        remote["diagnostics"] = [{
            "diagnostic": "HAULER_SHORTAGE", "severity": "HIGH", "evidence": {}
        }]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        self.assertIsNone(AutonomyController(self.history, transport).run(telemetry))
        self.assertEqual(transport.sent, [])

    def test_native_recovery_latch_suppresses_maintenance_after_load_improves(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        payload["empireLoad"] = {
            "state": "STRAINED", "growthVeto": False,
            "schedulerRecovery": {"active": True, "rooms": {"W1N1": {
                "satisfaction": 92.31, "stableSinceTick": payload["tick"] - 500,
                "stableRequiredTicks": 3000, "replacementCovered": True,
                "replacementGraceTicks": 200,
            }}},
            "homePopulation": {"satisfaction": 100, "criticalSatisfaction": 100},
            "spawnPressure": {"queueDepth": 0},
        }
        remote = payload["operations"]["remoteMining"][0]
        remote["diagnostics"] = [{
            "diagnostic": "HAULER_SHORTAGE", "severity": "HIGH", "evidence": {}
        }]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        self.assertIsNone(AutonomyController(self.history, transport).run(telemetry))
        self.assertEqual(transport.sent, [])
        self.assertIn("Native scheduler recovery: ACTIVE", build_report(self.history, telemetry))
        self.assertIn("stable 500/3000 ticks", build_report(self.history, telemetry))
        self.assertIn("routine replacement covered", build_report(self.history, telemetry))

    def test_critical_recovery_allows_only_held_reservation_inside_lead_window(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemoteMaintenance"] = True
        payload["empireLoad"] = {
            "state": "CRITICAL", "growthVeto": True,
            "homePopulation": {"satisfaction": 12.5, "criticalSatisfaction": 50},
            "spawnPressure": {"queueDepth": 4},
        }
        remote = payload["operations"]["remoteMining"][0]
        remote["reservation"].update({
            "relation": "SELF", "ticksToEnd": 100,
            "continuity": {"leadTicks": 236},
        })
        remote["diagnostics"] = [{
            "diagnostic": "RESERVATION_EXPIRING", "severity": "HIGH",
            "evidence": {"ticksToEnd": 100},
        }]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertIsNotNone(order)
        self.assertEqual(order.action, "ENSURE_REMOTE_RESERVATION")

    def test_critical_empire_pauses_only_top_ranked_remote(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoRemotePausing"] = True
        payload["empireLoad"] = {
            "state": "CRITICAL", "growthVeto": True,
            "homePopulation": {"satisfaction": 18.75, "criticalSatisfaction": 40},
            "spawnPressure": {"queueDepth": 5},
        }
        payload["remoteDrawdownRanking"] = [
            {"room": "W1N2", "score": 90, "health": "FAILING"},
        ]
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertIsNotNone(order)
        self.assertEqual(order.action, "PAUSE_REMOTE_MINING")
        self.assertEqual(order.parameters, {"room": "W1N2"})
        self.assertEqual(len(transport.sent), 1)
        self.assertEqual(self.history.recent_operations()[0]["action"], "PAUSE_REMOTE_MINING")

    def test_auto_abandonment_requires_fresh_unsuppressed_stop_loss_evidence(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["remoteAbandonment"] = True
        payload["authority"]["execution"]["autoRemoteAbandonment"] = True
        payload["authority"]["execution"]["autoScouting"] = False
        payload["authority"]["execution"]["autoRemoteMaintenance"] = False
        remote = payload["operations"]["remoteMining"][0]
        remote["health"] = "FAILING"
        remote["lifecycleState"] = "ABANDON_RECOMMENDED"
        remote["stopLoss"].update({
            "state": "ABANDON_RECOMMENDED", "badWindows": 4,
            "autoEligibilitySinceTick": payload["tick"] - 3000,
            "autoEligibilityRequiredTicks": 3000,
            "autoEligible": True,
            "autoEligibilityEvidence": ["delivery_near_zero"],
        })
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertIsNotNone(order)
        self.assertEqual(order.action, "STOP_REMOTE_MINING")
        self.assertEqual(order.parameters, {"room": "W1N2"})

        recovery_payload = telemetry_payload()
        recovery_payload["authority"]["mode"] = "execute"
        recovery_payload["authority"]["execution"].update({
            "remoteAbandonment": True, "autoRemoteAbandonment": True,
        })
        recovery_remote = recovery_payload["operations"]["remoteMining"][0]
        recovery_remote["lifecycleState"] = "ABANDON_RECOMMENDED"
        recovery_remote["stopLoss"].update({
            "state": "ABANDON_RECOMMENDED", "badWindows": 4,
            "autoEligible": True,
            "autoEligibilityEvidence": ["delivery_near_zero"],
        })
        recovery_payload["empireLoad"] = {
            "state": "HEALTHY", "growthVeto": False,
            "schedulerRecovery": {"active": True, "rooms": {}},
            "homePopulation": {"satisfaction": 100, "criticalSatisfaction": 100},
            "spawnPressure": {"queueDepth": 0},
        }
        recovery = Telemetry.model_validate(recovery_payload)
        other_history = HistoryStore(Path(self.temp.name) / "recovery-abandon.db")
        try:
            blocked = AutonomyController(
                other_history, FakeTransport(other_history, recovery.tick)
            ).run(recovery)
            self.assertIsNone(blocked)
        finally:
            other_history.close()

    def test_autonomous_scouting_is_bounded_and_resolves_unknown_intel(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoScouting"] = True
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertEqual(order.action, "SCOUT_ROOM")
        self.assertEqual(order.parameters["room"], "W0N1")
        payload["operations"]["scouting"] = [{
            "id": "active", "orderId": "active", "origin": "W1N1", "room": "W0N1",
            "status": "EN_ROUTE", "createdTick": telemetry.tick, "requestedTick": telemetry.tick,
            "observedTick": None, "completedTick": None, "intelLastSeenTick": None,
            "scoutCreep": "scou:test", "activeScouts": 1, "failureReason": None,
        }]
        telemetry = Telemetry.model_validate(payload)
        # A fresh controller uses an empty history to isolate the concurrency gate.
        other_history = HistoryStore(Path(self.temp.name) / "other.db")
        try:
            self.assertIsNone(AutonomyController(other_history, FakeTransport(other_history, telemetry.tick)).run(telemetry))
        finally:
            other_history.close()

        payload["operations"]["scouting"][0]["status"] = "OBSERVED"
        observed = Telemetry.model_validate(payload)
        observed_history = HistoryStore(Path(self.temp.name) / "observed.db")
        try:
            follow_up = AutonomyController(
                observed_history, FakeTransport(observed_history, observed.tick)
            ).run(observed)
            self.assertIsNotNone(follow_up)
            self.assertEqual(follow_up.action, "SCOUT_ROOM")
        finally:
            observed_history.close()

    def test_autonomous_scouting_skips_post_protection_targets_and_reconsiders_when_reachable(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"]["autoScouting"] = True
        payload["intelligence"]["unknownRooms"] = ["W0N1", "W0N2"]
        blocked = payload["intelligence"]["protectionByRoom"]["W0N1"]
        blocked["status"] = "normal"
        blocked["protected"] = False
        blocked["regionKey"] = None
        blocked["sharesCurrentProtectedRegion"] = False
        blocked["accessibility"] = "BLOCKED_BY_PROTECTED_BOUNDARY"
        blocked["reachableNow"] = False
        blocked["reachableAfterTimestamp"] = 1770000000000
        payload["intelligence"]["protectionByRoom"]["W0N2"] = {
            **blocked, "accessibility": "REACHABLE_NOW", "reachableNow": True,
            "reachableAfterTimestamp": None,
        }
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertEqual(order.parameters["room"], "W0N2")

        reopened_history = HistoryStore(Path(self.temp.name) / "reopened.db")
        try:
            payload["intelligence"]["unknownRooms"] = ["W0N1"]
            payload["intelligence"]["protectionByRoom"]["W0N1"]["accessibility"] = "REACHABLE_NOW"
            payload["intelligence"]["protectionByRoom"]["W0N1"]["reachableNow"] = True
            reopened = Telemetry.model_validate(payload)
            follow_up = AutonomyController(
                reopened_history, FakeTransport(reopened_history, reopened.tick)
            ).run(reopened)
            self.assertEqual(follow_up.parameters["room"], "W0N1")
        finally:
            reopened_history.close()

    def test_periodic_report_includes_operations_economics_intel_and_cost(self) -> None:
        telemetry = Telemetry.model_validate(telemetry_payload())
        report = build_report(self.history, telemetry, 24)
        self.assertIn("COMMANDER OPERATIONS BRIEFING", report)
        self.assertIn("Remote performance", report)
        self.assertIn("Territorial intelligence", report)
        self.assertIn("Expansion planning", report)
        self.assertIn("Protection NOVICE", report)
        self.assertIn("Military preparation", report)
        self.assertIn("Military intelligence and feasibility", report)
        self.assertIn("Offensive execution remains disabled", report)
        self.assertIn("Candidate sets", report)
        self.assertIn("API cost", report)

    def test_respawn_rules_preserve_gcl_capacity_and_safe_mode_is_separate(self) -> None:
        payload = telemetry_payload()
        protection = payload["empire"]["protection"]
        protection.update({
            "status": "respawn", "globalGclClaimSlots": 22,
            "currentProtectionClaimSlots": 22, "claimLimit": None,
            "rules": {
                "status": "respawn", "temporaryBoundary": True,
                "claimLimitType": "NORMAL_GCL", "nukersAllowed": False,
                "reachable": True, "reservationsUnlimited": True,
                "outsidePlayersExcluded": True, "residentConflictPossible": True,
                "safeModeSeparate": True,
            },
        })
        payload["empire"]["gcl"].update({
            "level": 23, "ownedRooms": 1, "availableClaimSlots": 22,
            "globalGclClaimSlots": 22, "currentProtectionClaimSlots": 22,
        })
        payload["colonies"]["W1N1"]["controller"]["safeMode"] = 1200
        payload["colonies"]["W1N1"]["protection"].update({
            "status": "respawn", "regionKey": "respawn:1770000000000",
        })
        telemetry = Telemetry.model_validate(payload)
        self.assertEqual(telemetry.empire.protection.rules.claimLimitType, "NORMAL_GCL")
        self.assertEqual(telemetry.empire.protection.currentProtectionClaimSlots, 22)
        self.assertEqual(telemetry.colonies["W1N1"].controller.safeMode, 1200)
        self.assertEqual(telemetry.colonies["W1N1"].protection.status, "respawn")
        report = build_report(self.history, telemetry, 24)
        self.assertIn("claim rule NORMAL_GCL", report)

    def test_auto_colonization_selects_only_an_authoritatively_ready_plan(self) -> None:
        payload = telemetry_payload()
        payload["authority"]["mode"] = "execute"
        payload["authority"]["execution"].update({
            "colonization": True, "autoColonization": True,
            "autoScouting": True, "autoRemoteMaintenance": True,
        })
        payload["operations"]["remoteMining"][0]["diagnostics"] = [{
            "diagnostic": "HAULER_SHORTAGE", "severity": "HIGH", "evidence": {}
        }]
        layout = {"name": "def_hor", "origin": {"x": 20, "y": 20}, "score": 90}
        candidate = payload["expansionCandidates"][0]
        candidate.update({
            "eligible": True, "origin": "W1N1", "layout": layout,
            "validLayouts": [layout], "economicConversion": {"isExistingRemote": True},
            "bootstrap": {"estimatedEnergy": 46300}, "strategy": {"adjacentRemotePotential": 2},
        })
        payload["claimCandidates"] = [candidate]
        payload["expansionReadiness"] = {
            "status": "READY", "reasons": [], "recommendedRoom": "W1N2", "origin": "W1N1",
            "layout": layout, "candidateScore": 80, "currentOperationalRole": "OUR_REMOTE",
            "bootstrap": candidate["bootstrap"], "economicConversion": candidate["economicConversion"],
            "claimSlots": 3, "globalGclClaimSlots": 3, "currentProtectionClaimSlots": 2,
            "recommendedSimultaneousColonizations": 1, "operationalLimitReason": None,
            "spawnCapacity": "ADEQUATE", "components": {},
        }
        telemetry = Telemetry.model_validate(payload)
        transport = FakeTransport(self.history, telemetry.tick)
        order = AutonomyController(self.history, transport).run(telemetry)
        self.assertIsNotNone(order)
        self.assertEqual(order.action, "COLONIZE_ROOM")
        self.assertEqual(order.parameters["target"], "W1N2")
        self.assertEqual(order.parameters["layout"], layout)
        operation = self.history.recent_operations(1)[0]
        self.assertEqual(operation["action"], "COLONIZE_ROOM")


if __name__ == "__main__":
    unittest.main()
