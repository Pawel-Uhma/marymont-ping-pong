# standings.py — recompute player standings from finished matches
# Exposes:
#   - compute_standings(payload, auth_user) -> HTTP response dict
#   - get_standings(payload) -> HTTP response dict
#
# S3 layout:
#   data/{category}/standings.json - contains player stats by playerId
#   data/{category}/matches.json - all matches
#   data/accounts.json - player information
#   data/{category}/groups.json - group information

import os, json, time, boto3

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
DATA_BUCKET  = os.environ.get("DATA_BUCKET", "marymont-ping-pong")
S3 = boto3.client("s3")

# ---- HTTP ----
def _resp(code:int, body:dict):
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

# ---- S3 JSON ----
def _get_json(key:str, default):
    try:
        o = S3.get_object(Bucket=DATA_BUCKET, Key=key)
        return json.loads(o["Body"].read().decode("utf-8"))
    except Exception as e:
        if getattr(e, "response", {}).get("Error", {}).get("Code") in ("NoSuchKey","404"):
            return default
        raise

def _put_json(key:str, data:dict):
    S3.put_object(
        Bucket=DATA_BUCKET,
        Key=key,
        Body=json.dumps(data, separators=(",",":"), ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )

def _now(): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# ---- Paths ----
def _p_groups(cat):        return f"data/{cat}/groups.json"
def _p_matches(cat):       return f"data/{cat}/matches.json"
def _p_standings(cat):     return f"data/{cat}/standings.json"
def _p_accounts():         return "data/accounts.json"

# ---- Helpers ----
def _valid_set(a:int,b:int)->bool:
    mx = max(a,b); diff = abs(a-b)
    return mx >= 11 and diff >= 2

def _get_all_players_in_category(category):
    """Get all players in a category from accounts.json"""
    accounts = _get_json(_p_accounts(), {"users": []}).get("users", [])
    players = []
    for account in accounts:
        if (account.get("role") in ("player", "admin") and 
            account.get("category") == category and 
            account.get("playerId") is not None):
            players.append({
                "playerId": str(account.get("playerId")),
                "name": account.get("name"),
                "surname": account.get("surname"),
                "username": account.get("username")
            })
    return players

def _initialize_player_stats(player_id):
    """Initialize stats for a player"""
    return {
        "playerId": player_id,
        "matchesPlayed": 0,
        "wins": 0,
        "losses": 0,
        "setsWon": 0,
        "setsLost": 0,
        "pointsWon": 0,
        "pointsLost": 0,
        "setDifference": 0,
        "pointDifference": 0,
        "winPercentage": 0.0
    }

def _update_player_stats(stats, sets_for, sets_against, points_for, points_against, won):
    """Update player stats after a match"""
    stats["matchesPlayed"] += 1
    stats["setsWon"] += sets_for
    stats["setsLost"] += sets_against
    stats["pointsWon"] += points_for
    stats["pointsLost"] += points_against
    stats["setDifference"] = stats["setsWon"] - stats["setsLost"]
    stats["pointDifference"] = stats["pointsWon"] - stats["pointsLost"]
    
    if won:
        stats["wins"] += 1
    else:
        stats["losses"] += 1
    
    if stats["matchesPlayed"] > 0:
        stats["winPercentage"] = round(stats["wins"] / stats["matchesPlayed"], 3)

def _rank_players(players):
    """Rank players by wins, set difference, point difference"""
    players.sort(key=lambda p: (
        -p["wins"],
        -p["setDifference"],
        -p["pointDifference"],
        -p["winPercentage"]
    ))
    for i, player in enumerate(players, 1):
        player["rank"] = i

# ---- API ----
def compute_standings(payload:dict, auth_user:dict):
    """Compute and save player standings from all finished matches"""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error":"Forbidden"})
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})

    # Get all players in the category
    players = _get_all_players_in_category(category)
    if not players:
        # No players found, return empty standings
        standings = {
            "players": [],
            "updatedAt": _now(),
            "version": 1
        }
        _put_json(_p_standings(category), standings)
        return _resp(200, {"standings": standings})

    # Initialize player stats
    player_stats = {}
    for player in players:
        player_stats[player["playerId"]] = _initialize_player_stats(player["playerId"])

    # Get all finished matches
    matches = _get_json(_p_matches(category), {"matches":[]}).get("matches", [])
    finished_matches = [m for m in matches if m.get("status") == "final"]

    # Process each finished match
    for match in finished_matches:
        p1_id = str(match.get("p1", ""))
        p2_id = str(match.get("p2", ""))
        winner = match.get("winner")
        
        # Skip if players not found in our player list
        if p1_id not in player_stats or p2_id not in player_stats:
            continue
        
        # Calculate sets and points
        p1_sets = p2_sets = p1_points = p2_points = 0
        for set_data in match.get("sets", []):
            p1_score = int(set_data.get("p1", 0))
            p2_score = int(set_data.get("p2", 0))
            p1_points += p1_score
            p2_points += p2_score
            
            if _valid_set(p1_score, p2_score):
                if p1_score > p2_score:
                    p1_sets += 1
                else:
                    p2_sets += 1
        
        # Update player stats
        p1_won = winner == p1_id
        p2_won = winner == p2_id
        
        _update_player_stats(player_stats[p1_id], p1_sets, p2_sets, p1_points, p2_points, p1_won)
        _update_player_stats(player_stats[p2_id], p2_sets, p1_sets, p2_points, p1_points, p2_won)

    # Convert to list and rank players
    standings_list = list(player_stats.values())
    _rank_players(standings_list)

    # Save standings
    standings = {
        "players": standings_list,
        "updatedAt": _now(),
        "version": 1
    }
    _put_json(_p_standings(category), standings)
    return _resp(200, {"standings": standings})
    
def get_standings(payload: dict):
    """Get standings with player information joined"""
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})
    
    # Get standings data
    standings_data = _get_json(_p_standings(category), {"players": [], "updatedAt": _now(), "version": 1})
    player_stats = standings_data.get("players", [])
    
    # Get player information
    players_info = _get_all_players_in_category(category)
    players_dict = {p["playerId"]: p for p in players_info}
    
    # Get groups information
    groups_data = _get_json(_p_groups(category), {"groups": []})
    groups = groups_data.get("groups", [])
    
    # Create group lookup
    player_to_group = {}
    for group in groups:
        for player_id in group.get("players", []):
            player_to_group[player_id] = group.get("id", "Unknown")
    
    # Join standings with player info and group info
    enriched_standings = []
    for stats in player_stats:
        player_id = stats.get("playerId")
        player_info = players_dict.get(player_id, {})
        
        enriched_player = {
            **stats,  # Include all stats
            "name": player_info.get("name", "Unknown"),
            "surname": player_info.get("surname", "Unknown"),
            "username": player_info.get("username", "Unknown"),
            "group": player_to_group.get(player_id, "No Group")
        }
        enriched_standings.append(enriched_player)
    
    return _resp(200, {
        "players": enriched_standings,
        "updatedAt": standings_data.get("updatedAt"),
        "version": standings_data.get("version", 1)
    })