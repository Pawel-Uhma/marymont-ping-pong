# groups.py — list/generate groups and seed group matches & standings
# Exposes:
#   - list_groups(payload) -> HTTP response dict
#   - generate_groups(payload, auth_user) -> HTTP response dict
#
# S3 layout (root):
#   man/players.json
#   man/groups.json
#   man/matches_group.json
#   man/standings_group.json
#   woman/... (same)

import os
import json
import base64
import time
import boto3

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
DATA_BUCKET = os.environ.get("DATA_BUCKET", "marymont-ping-pong")
S3 = boto3.client("s3")

# ---------- HTTP helper ----------
def _resp(code: int, body: dict):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": CORS_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }

# ---------- S3 JSON helpers ----------
def _get_json(key: str, default):
    try:
        obj = S3.get_object(Bucket=DATA_BUCKET, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except Exception as e:
        if getattr(e, "response", {}).get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return default
        raise

def _put_json(key: str, data: dict):
    S3.put_object(
        Bucket=DATA_BUCKET,
        Key=key,
        Body=json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )

def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def _new_match_id(prefix="mg"):
    return f"{prefix}_" + base64.urlsafe_b64encode(os.urandom(5)).decode().rstrip("=")

# ---------- Paths ----------
def _p_players(category: str) -> str:         return f"data/{category}/players.json"
def _p_groups(category: str) -> str:          return f"data/{category}/groups.json"
def _p_matches_group(category: str) -> str:   return f"data/{category}/matches_group.json"
def _p_standings(category: str) -> str:       return f"data/{category}/standings_group.json"

# ---------- Public: list groups ----------
def list_groups(payload: dict):
    category = (payload or {}).get("category")
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    data = _get_json(_p_groups(category), {"groups": [], "version": 1})
    return _resp(200, {"groups": data.get("groups", [])})

# ---------- Admin: generate groups of 4, seed round-robin matches + standings ----------
def generate_groups(payload: dict, auth_user: dict):
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Forbidden"})

    category = (payload or {}).get("category")
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})

    # Load players
    players_file = _get_json(_p_players(category), {"players": []})
    players = players_file.get("players", [])
    if len(players) == 0:
        return _resp(400, {"error": "no players to group"})

    # Chunk into groups of 4 (keep order; simple and predictable)
    groups = []
    for i in range(0, len(players), 4):
        chunk = [p["id"] for p in players[i:i+4]]
        if chunk:
            groups.append({"id": f"G{len(groups)+1}", "players": chunk})

    # Save groups.json
    groups_json = {"groups": groups, "updatedAt": _now_iso(), "version": 1}
    _put_json(_p_groups(category), groups_json)

    # Build round-robin matches for each group (every pair once), 5-set placeholders
    matches = []
    for g in groups:
        ids = g["players"]
        for a in range(len(ids)):
            for b in range(a + 1, len(ids)):
                matches.append({
                    "id": _new_match_id("mg"),
                    "phase": "group",
                    "groupId": g["id"],
                    "p1": ids[a],
                    "p2": ids[b],
                    "sets": [{"p1": 0, "p2": 0} for _ in range(5)],
                    "winner": None,
                    "status": "scheduled",
                    "scheduledAt": None,
                    "updatedBy": None
                })

    _put_json(_p_matches_group(category), {
        "matches": matches,
        "updatedAt": _now_iso(),
        "version": 1
    })

    # Seed empty standings (one row per player per group)
    st_groups = []
    for g in groups:
        st_groups.append({
            "groupId": g["id"],
            "table": [
                {
                    "playerId": pid,
                    "wins": 0, "losses": 0,
                    "setsFor": 0, "setsAgainst": 0,
                    "pointsFor": 0, "pointsAgainst": 0,
                    "rank": 0
                } for pid in g["players"]
            ]
        })

    _put_json(_p_standings(category), {
        "groups": st_groups,
        "tiebreakers": ["wins", "setDiff", "pointDiff", "headToHead", "random"],
        "updatedAt": _now_iso(),
        "version": 1
    })

    return _resp(200, {
        "groups": groups,
        "matchesCreated": len(matches)
    })

# ---------- Admin: create/overwrite group setup ----------
def create_group(payload: dict, auth_user: dict):
    """Create or overwrite a group with given ID and players. Requires admin role.
    This replaces the entire group setup for the category."""

    group_id = (payload or {}).get("id", "").strip()
    players = (payload or {}).get("players", [])
    category = (payload or {}).get("category", "").strip()
    
    # Validation
    if not group_id:
        return _resp(400, {"error": "group id required"})
    
    if not isinstance(players, list):
        return _resp(400, {"error": "players must be a list"})
    
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    # Load existing groups
    groups_data = _get_json(_p_groups(category), {"groups": [], "version": 1})
    existing_groups = groups_data.get("groups", [])
    
    # Create new group
    new_group = {
        "id": group_id,
        "players": players
    }
    
    # Check if group ID already exists and replace it, otherwise add new
    group_found = False
    for i, group in enumerate(existing_groups):
        if group.get("id") == group_id:
            existing_groups[i] = new_group
            group_found = True
            break
    
    if not group_found:
        existing_groups.append(new_group)
    
    # Save groups.json (replace entire setup)
    groups_json = {
        "groups": existing_groups,
        "updatedAt": _now_iso(),
        "version": groups_data.get("version", 1) + 1
    }
    _put_json(_p_groups(category), groups_json)
    
    action = "updated" if group_found else "created"
    return _resp(200, {
        "success": True,
        "message": f"Group '{group_id}' {action} successfully",
        "group": new_group
    })
