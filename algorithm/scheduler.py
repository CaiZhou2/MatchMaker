"""
MatchMaker - Weekly Cup Tournament Scheduler (Python prototype)

Workflow:
    1. Maintain a player database with points (W=3, D=1, L=0).
    2. Each event: select attendees, auto-form balanced teams based on ranking,
       recommend a tournament format (prefer groups + knockout), generate
       schedule, record results, update points.
"""

import math
import random
from collections import defaultdict


# ────────────────────────────────────────────────────────────────────────────
# Player Database
# ────────────────────────────────────────────────────────────────────────────

def new_player(name: str) -> dict:
    return {
        "name": name,
        "points": 0,
        "wins": 0,
        "draws": 0,
        "losses": 0,
        "events": 0,
    }


def apply_match_result(players_db: dict, team_a: list[str], team_b: list[str], result: str):
    """result in {'A', 'B', 'D'}."""
    for name in team_a + team_b:
        if name not in players_db:
            players_db[name] = new_player(name)

    if result == "A":
        for p in team_a:
            players_db[p]["points"] += 3
            players_db[p]["wins"] += 1
        for p in team_b:
            players_db[p]["losses"] += 1
    elif result == "B":
        for p in team_b:
            players_db[p]["points"] += 3
            players_db[p]["wins"] += 1
        for p in team_a:
            players_db[p]["losses"] += 1
    elif result == "D":
        for p in team_a + team_b:
            players_db[p]["points"] += 1
            players_db[p]["draws"] += 1


# ────────────────────────────────────────────────────────────────────────────
# Balanced team formation
# ────────────────────────────────────────────────────────────────────────────

def win_rate(p: dict) -> float:
    total = p.get("wins", 0) + p.get("draws", 0) + p.get("losses", 0)
    return p.get("wins", 0) / total if total > 0 else 0.0


def total_games(p: dict) -> int:
    return p.get("wins", 0) + p.get("draws", 0) + p.get("losses", 0)


def form_balanced_teams(
    attendees: list[str],
    players_db: dict,
    team_size: int,
    seed: int | None = None,
) -> dict:
    """
    Rule (from user):
      - T = floor(N / team_size) teams
      - Top T ranked attendees (by win rate) become captains, one per team
      - Remaining attendees are shuffled and distributed round-robin into teams
      - Ranking: win rate desc, games played desc, then random

    Returns: {"teams": [{"name", "players": [...]}], "spectators": [...]}
    """
    if seed is not None:
        random.seed(seed)

    n = len(attendees)
    num_teams = n // team_size
    if num_teams < 2:
        return {
            "error": f"Need at least {2 * team_size} players (got {n}).",
            "teams": [],
            "spectators": attendees,
        }

    jitter = {name: random.random() for name in attendees}

    def rank_key(name):
        p = players_db.get(name, new_player(name))
        return (-win_rate(p), -total_games(p), jitter[name])

    ranked = sorted(attendees, key=rank_key)
    captains = ranked[:num_teams]
    rest = ranked[num_teams : num_teams * team_size]
    spectators = ranked[num_teams * team_size :]

    random.shuffle(rest)

    teams = [{"name": f"Team {i+1}", "players": [captains[i]]} for i in range(num_teams)]

    # Distribute rest round-robin
    for i, player in enumerate(rest):
        teams[i % num_teams]["players"].append(player)

    return {"teams": teams, "spectators": spectators}


# ────────────────────────────────────────────────────────────────────────────
# Tournament format planning
# ────────────────────────────────────────────────────────────────────────────

def _round_robin_pairings(team_ids: list[int]) -> list[list[tuple[int, int]]]:
    """Berger/circle method. Returns list of rounds, each a list of (a, b) pairs.
    If odd number of teams, one sits out each round (marked as -1)."""
    n = len(team_ids)
    teams = list(team_ids)
    if n % 2 == 1:
        teams.append(-1)
    m = len(teams)
    rounds = []
    for r in range(m - 1):
        round_pairs = []
        for i in range(m // 2):
            a, b = teams[i], teams[m - 1 - i]
            if a != -1 and b != -1:
                round_pairs.append((a, b))
        rounds.append(round_pairs)
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]
    return rounds


def plan_round_robin(teams: list[dict], num_courts: int, match_duration: int, total_time: int) -> dict:
    """Plan a single round-robin. Returns schedule + feasibility."""
    team_ids = list(range(len(teams)))
    rounds = _round_robin_pairings(team_ids)

    # Each "round" has matches that can be played in parallel on courts
    schedule = []  # list of time slots
    slot_idx = 0
    max_slots = total_time // match_duration

    for round_idx, round_pairs in enumerate(rounds):
        # Split round across slots if more matches than courts
        for batch_start in range(0, len(round_pairs), num_courts):
            batch = round_pairs[batch_start : batch_start + num_courts]
            if slot_idx >= max_slots:
                return {
                    "format": "round-robin",
                    "schedule": schedule,
                    "fits": False,
                    "reason": "超出时间限制",
                }
            schedule.append({
                "phase": "round-robin",
                "round": round_idx + 1,
                "slot": slot_idx + 1,
                "matches": [
                    {"court": i + 1, "team_a": a, "team_b": b, "kind": "ranked"}
                    for i, (a, b) in enumerate(batch)
                ],
            })
            slot_idx += 1

    return {
        "format": "round-robin",
        "schedule": schedule,
        "fits": True,
        "slots_used": slot_idx,
    }


def plan_groups_knockout(
    teams: list[dict], num_courts: int, match_duration: int, total_time: int
) -> dict:
    """Plan group stage + knockout. Tries several group sizes."""
    T = len(teams)
    if T < 4:
        return {"fits": False, "reason": "队伍太少，不适合小组赛"}

    # Decide group structure: prefer groups of 4, then 3
    # Number of groups = G, sizes balanced
    best = None
    for group_size in [4, 3]:
        num_groups = T // group_size
        if num_groups < 2:
            continue
        # Assign teams to groups (handle remainders by +1 to early groups)
        remainder = T - num_groups * group_size
        group_sizes = [group_size + (1 if i < remainder else 0) for i in range(num_groups)]

        # Advancing teams: top 2 per group (or top 1 if group_size == 3 and total advancing >= 4)
        advance_per_group = 2
        total_advancing = advance_per_group * num_groups

        # Must be power of 2 for clean knockout; drop extras from lowest seeds if not
        kn_size = 1
        while kn_size * 2 <= total_advancing:
            kn_size *= 2
        if kn_size < 2:
            continue

        plan = _build_groups_knockout(
            teams, group_sizes, kn_size, num_courts, match_duration, total_time
        )
        if plan["fits"]:
            if best is None or plan["slots_used"] < best["slots_used"]:
                best = plan

    if best:
        return best
    return {"fits": False, "reason": "时间不足以完成小组赛+淘汰赛"}


def _build_groups_knockout(teams, group_sizes, kn_size, num_courts, match_duration, total_time):
    T = len(teams)
    max_slots = total_time // match_duration

    # Assign team ids to groups sequentially (could randomize / snake later)
    group_team_ids = []
    idx = 0
    for size in group_sizes:
        group_team_ids.append(list(range(idx, idx + size)))
        idx += size

    schedule = []
    slot_idx = 0

    # --- Group stage ---
    # For each group, compute rounds; run groups in parallel on courts
    # Simpler: union all group-round pairings into time slots
    group_rounds = [_round_robin_pairings(g) for g in group_team_ids]
    max_rounds = max(len(gr) for gr in group_rounds)

    for r in range(max_rounds):
        # Collect all matches from round r of every group
        round_matches = []
        for g, gr in enumerate(group_rounds):
            if r < len(gr):
                for a, b in gr[r]:
                    round_matches.append((a, b))
        # Split across slots by court capacity
        for bs in range(0, len(round_matches), num_courts):
            batch = round_matches[bs : bs + num_courts]
            if slot_idx >= max_slots:
                return {"fits": False, "reason": "小组赛超时"}
            schedule.append({
                "phase": "group",
                "round": r + 1,
                "slot": slot_idx + 1,
                "matches": [
                    {"court": i + 1, "team_a": a, "team_b": b, "kind": "ranked"}
                    for i, (a, b) in enumerate(batch)
                ],
            })
            slot_idx += 1

    # --- Knockout stage ---
    # We don't know exact participants yet (depends on group results).
    # Represent matches as placeholders: ("G1-1", "G2-2") etc.
    advancing = []
    for g_idx, size in enumerate(group_sizes):
        advancing.append(f"G{g_idx+1}-1")
        advancing.append(f"G{g_idx+1}-2")
    # Trim to kn_size (lowest seeds removed)
    advancing = advancing[:kn_size]

    # Knockout bracket
    current = advancing[:]
    kn_round = 0
    while len(current) > 1:
        kn_round += 1
        next_round = []
        round_matches = []
        for i in range(0, len(current), 2):
            a, b = current[i], current[i + 1]
            round_matches.append((a, b))
            next_round.append(f"KR{kn_round}-M{i//2 + 1}-W")  # winner placeholder

        # Tournament matches use (courts - 1) during knockout if possible, so that
        # at least 1 court can be reserved for eliminated-teams' friendly matches.
        # If courts == 1, no reservation possible.
        tournament_courts = max(1, num_courts - 1) if num_courts > 1 else 1

        for bs in range(0, len(round_matches), tournament_courts):
            batch = round_matches[bs : bs + tournament_courts]
            if slot_idx >= max_slots:
                return {"fits": False, "reason": "淘汰赛超时"}
            matches = [
                {"court": i + 1, "team_a": a, "team_b": b, "kind": "ranked"}
                for i, (a, b) in enumerate(batch)
            ]
            # Reserve last court for friendlies if we have extra capacity
            if num_courts > len(batch):
                matches.append({
                    "court": num_courts,
                    "team_a": "自由",
                    "team_b": "自由",
                    "kind": "friendly",
                })
            schedule.append({
                "phase": "knockout",
                "round": f"KR{kn_round}",
                "slot": slot_idx + 1,
                "matches": matches,
            })
            slot_idx += 1

        current = next_round

    return {
        "format": "groups-knockout",
        "group_sizes": group_sizes,
        "knockout_size": kn_size,
        "schedule": schedule,
        "fits": True,
        "slots_used": slot_idx,
    }


def recommend_format(teams, num_courts, match_duration, total_time):
    """Pick the best format automatically."""
    T = len(teams)
    if T < 2:
        return {"error": "至少需要2支队伍", "fits": False}

    # Prefer groups + knockout if T >= 4
    if T >= 4:
        gk = plan_groups_knockout(teams, num_courts, match_duration, total_time)
        if gk.get("fits"):
            return gk

    # Fall back to round-robin
    return plan_round_robin(teams, num_courts, match_duration, total_time)


# ────────────────────────────────────────────────────────────────────────────
# Pretty printer
# ────────────────────────────────────────────────────────────────────────────

def format_plan(plan: dict, teams: list[dict], match_duration: int) -> str:
    if plan.get("error"):
        return f"Error: {plan['error']}"
    if not plan.get("fits", True):
        return f"Error: {plan.get('reason', 'unknown')}"

    lines = []
    lines.append("=" * 54)
    lines.append(f"FORMAT: {plan['format']}")
    if plan.get("group_sizes"):
        lines.append(f"Groups: {plan['group_sizes']}  Knockout: {plan['knockout_size']}")
    lines.append(f"Slots used: {plan['slots_used']} (duration per slot: {match_duration}m)")
    lines.append("=" * 54)

    def team_name(x):
        if isinstance(x, int):
            return teams[x]["name"]
        return x  # placeholder string

    for slot in plan["schedule"]:
        header = f"[Slot {slot['slot']}] {slot['phase']} round {slot['round']}"
        lines.append(header)
        for m in slot["matches"]:
            tag = "" if m["kind"] == "ranked" else " (friendly)"
            lines.append(
                f"  Court {m['court']}: {team_name(m['team_a'])} vs {team_name(m['team_b'])}{tag}"
            )
    return "\n".join(lines)


# ────────────────────────────────────────────────────────────────────────────
# Demo
# ────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Seed a fake database
    db = {}
    for i, name in enumerate([
        "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank",
        "Grace", "Henry", "Ivy", "Jack", "Kate", "Leo",
    ]):
        db[name] = new_player(name)
        db[name]["points"] = (12 - i) * 3  # descending points for demo

    attendees = list(db.keys())

    # Form teams
    res = form_balanced_teams(attendees, db, team_size=2, seed=42)
    print("=" * 54)
    print("BALANCED TEAMS")
    print("=" * 54)
    for t in res["teams"]:
        names = ", ".join(t["players"])
        print(f"  {t['name']}: {names}")
    print()

    # Recommend format
    plan = recommend_format(
        teams=res["teams"],
        num_courts=2,
        match_duration=15,
        total_time=180,
    )
    print(format_plan(plan, res["teams"], match_duration=15))
