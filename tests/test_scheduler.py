"""
MatchMaker — Python algorithm prototype tests

Uses `unittest` from the stdlib so there are zero dependencies. Run with:

    python3 tests/test_scheduler.py

or as a module:

    python3 -m unittest discover tests
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "algorithm"))

from scheduler import (  # noqa: E402
    new_player,
    win_rate,
    total_games,
    form_balanced_teams,
    recommend_format,
    plan_round_robin,
    plan_groups_knockout,
    apply_match_result,
)


class WinRateTests(unittest.TestCase):
    def test_new_player_has_zero_wr(self):
        self.assertEqual(win_rate(new_player("Alice")), 0.0)
        self.assertEqual(total_games(new_player("Alice")), 0)

    def test_wr_is_fraction_of_wins(self):
        p = new_player("Alice")
        p["wins"] = 7
        p["draws"] = 2
        p["losses"] = 1
        self.assertAlmostEqual(win_rate(p), 0.7)
        self.assertEqual(total_games(p), 10)

    def test_handles_missing_fields(self):
        self.assertEqual(win_rate({}), 0.0)
        self.assertEqual(total_games({}), 0)


class MatchResultTests(unittest.TestCase):
    def setUp(self):
        self.db = {n: new_player(n) for n in ["A", "B", "C", "D"]}

    def test_win_gives_three_points_and_bump_wins(self):
        apply_match_result(self.db, ["A", "B"], ["C", "D"], "A")
        self.assertEqual(self.db["A"]["points"], 3)
        self.assertEqual(self.db["A"]["wins"], 1)
        self.assertEqual(self.db["B"]["points"], 3)
        self.assertEqual(self.db["C"]["points"], 0)
        self.assertEqual(self.db["C"]["losses"], 1)

    def test_draw_gives_one_point_to_both(self):
        apply_match_result(self.db, ["A", "B"], ["C", "D"], "D")
        for p in self.db.values():
            self.assertEqual(p["points"], 1)
            self.assertEqual(p["draws"], 1)

    def test_loss_bumps_losses_only(self):
        apply_match_result(self.db, ["A", "B"], ["C", "D"], "B")
        self.assertEqual(self.db["A"]["points"], 0)
        self.assertEqual(self.db["A"]["losses"], 1)
        self.assertEqual(self.db["C"]["points"], 3)
        self.assertEqual(self.db["C"]["wins"], 1)


class TeamFormationTests(unittest.TestCase):
    def _db_with_wr(self, specs):
        db = {}
        for name, w, d, l in specs:
            p = new_player(name)
            p["wins"] = w
            p["draws"] = d
            p["losses"] = l
            p["points"] = w * 3 + d
            db[name] = p
        return db

    def test_forms_floor_n_over_size_teams(self):
        db = self._db_with_wr([
            ("A", 5, 0, 0),
            ("B", 3, 0, 2),
            ("C", 2, 0, 3),
            ("D", 1, 0, 4),
            ("E", 0, 0, 0),
            ("F", 0, 0, 0),
            ("G", 0, 0, 0),
            ("H", 0, 0, 0),
        ])
        res = form_balanced_teams(list(db.keys()), db, team_size=2, seed=7)
        self.assertEqual(len(res["teams"]), 4)
        for t in res["teams"]:
            self.assertEqual(len(t["players"]), 2)

    def test_captains_are_top_ranked_by_win_rate(self):
        db = self._db_with_wr([
            ("Alice", 10, 0, 0),  # 100% WR, 10 games
            ("Bob",   6,  0, 4),  # 60%
            ("Cara",  4,  0, 6),  # 40%
            ("Dan",   2,  0, 8),  # 20%
            ("Eve",   0,  0, 0),  # 0% (new)
            ("Finn",  0,  0, 0),
            ("Gia",   0,  0, 0),
            ("Hank",  0,  0, 0),
        ])
        res = form_balanced_teams(list(db.keys()), db, team_size=2, seed=1)
        captains = [t["players"][0] for t in res["teams"]]
        self.assertEqual(captains, ["Alice", "Bob", "Cara", "Dan"])

    def test_too_few_players_returns_error(self):
        db = {"A": new_player("A")}
        res = form_balanced_teams(["A"], db, team_size=2)
        self.assertIn("error", res)
        self.assertEqual(res["teams"], [])


class RoundRobinTests(unittest.TestCase):
    def _teams(self, n):
        return [{"name": f"T{i+1}", "players": []} for i in range(n)]

    def test_four_teams_produces_six_matches(self):
        plan = plan_round_robin(self._teams(4), num_courts=2, match_duration=10, total_time=60)
        self.assertTrue(plan["fits"])
        total = sum(
            len([m for m in slot["matches"] if m["kind"] == "ranked"])
            for slot in plan["schedule"]
        )
        self.assertEqual(total, 6)

    def test_every_team_plays_every_other_exactly_once(self):
        plan = plan_round_robin(self._teams(5), num_courts=2, match_duration=10, total_time=120)
        pairs = set()
        for slot in plan["schedule"]:
            for m in slot["matches"]:
                if m["kind"] != "ranked":
                    continue
                pair = tuple(sorted((m["team_a"], m["team_b"])))
                self.assertNotIn(pair, pairs, "duplicate pair seen")
                pairs.add(pair)
        self.assertEqual(len(pairs), 10)  # C(5, 2)

    def test_no_team_plays_twice_in_same_slot(self):
        plan = plan_round_robin(self._teams(6), num_courts=3, match_duration=10, total_time=120)
        for slot in plan["schedule"]:
            used = set()
            for m in slot["matches"]:
                if m["kind"] != "ranked":
                    continue
                self.assertNotIn(m["team_a"], used)
                self.assertNotIn(m["team_b"], used)
                used.add(m["team_a"])
                used.add(m["team_b"])

    def test_infeasible_when_budget_too_small(self):
        plan = plan_round_robin(self._teams(4), num_courts=1, match_duration=10, total_time=20)
        self.assertFalse(plan["fits"])


class GroupsKnockoutTests(unittest.TestCase):
    def _teams(self, n):
        return [{"name": f"T{i+1}", "players": []} for i in range(n)]

    def test_eight_teams_picks_groups_knockout(self):
        plan = recommend_format(self._teams(8), num_courts=3, match_duration=15, total_time=240)
        self.assertEqual(plan["format"], "groups-knockout")
        self.assertEqual(plan["knockout_size"], 4)
        self.assertEqual(plan["group_sizes"], [4, 4])

    def test_three_teams_falls_back_to_round_robin(self):
        plan = recommend_format(self._teams(3), num_courts=1, match_duration=10, total_time=60)
        self.assertEqual(plan["format"], "round-robin")

    def test_group_matches_stay_within_group(self):
        plan = recommend_format(self._teams(8), num_courts=3, match_duration=15, total_time=240)
        team_to_group = {}
        cursor = 0
        for gi, size in enumerate(plan["group_sizes"]):
            for _ in range(size):
                team_to_group[cursor] = gi
                cursor += 1
        for slot in plan["schedule"]:
            if slot["phase"] != "group":
                continue
            for m in slot["matches"]:
                if m["kind"] != "ranked":
                    continue
                self.assertEqual(
                    team_to_group[m["team_a"]],
                    team_to_group[m["team_b"]],
                    f"Cross-group match: {m['team_a']} vs {m['team_b']}"
                )

    def test_knockout_reserves_friendly_court_when_spare(self):
        plan = recommend_format(self._teams(8), num_courts=3, match_duration=15, total_time=240)
        ko_slots = [s for s in plan["schedule"] if s["phase"] == "knockout"]
        friendly = [
            m for s in ko_slots for m in s["matches"] if m["kind"] == "friendly"
        ]
        self.assertGreater(len(friendly), 0)

    def test_knockout_uses_placeholder_refs(self):
        plan = recommend_format(self._teams(8), num_courts=3, match_duration=15, total_time=240)
        for slot in plan["schedule"]:
            if slot["phase"] != "knockout":
                continue
            for m in slot["matches"]:
                if m["kind"] != "ranked":
                    continue
                self.assertIsInstance(m["team_a"], str)
                self.assertIsInstance(m["team_b"], str)


if __name__ == "__main__":
    unittest.main(verbosity=2)
