# matches.py — list & update matches (Python 3.11)
# Exposes:
#   - list_matches(payload) -> HTTP response dict
#   - update_score(payload, auth_user) -> HTTP response dict
#
# S3 layout (root):
#   man/matches_group.json
#   man/matches_elim.json
#   woman/matches_group.json
#   woman/matches_elim.json
#
# Payloads:
#   list:  { category: "man"|"woman", phase: "group"|"elim" }
#   update:{ category, phase, matchId, status:"scheduled"|"in_progress"|"final",
#            sets: [ {p1:int, p2:int} x5 ] }

import os
import json
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

# ---------- Paths ----------
def _p_matches(category: str, phase: str) -> str:
    if phase == "group":
        return f"data/{category}/matches_group.json"
    return f"data/{category}/matches_elim.json"

# ---------- Scoring rules ----------
def _valid_set(a: int, b: int) -> bool:
    mx = max(a, b)
    diff = abs(a - b)
    return mx >= 11 and diff >= 2

def _compute_winner(sets):
    # Returns "p1", "p2", or None
    w1 = w2 = 0
    for s in sets:
        a, b = int(s.get("p1", 0)), int(s.get("p2", 0))
        if not _valid_set(a, b):
            continue
        if a > b: w1 += 1
        else:     w2 += 1
    if w1 >= 3: return "p1"
    if w2 >= 3: return "p2"
    return None

# ---------- API: list ----------
def list_matches(payload: dict):
    category = (payload or {}).get("category")
    phase = (payload or {}).get("phase")
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    if phase not in ("group", "elim"):
        return _resp(400, {"error": "phase must be group|elim"})

    data = _get_json(_p_matches(category, phase), {"matches": [], "version": 1})
    return _resp(200, {"matches": data.get("matches", [])})

# ---------- API: update score ----------
def update_score(payload: dict, auth_user: dict):
    if not auth_user:
        return _resp(401, {"error": "Unauthorized"})

    category = (payload or {}).get("category")
    phase = (payload or {}).get("phase")
    match_id = (payload or {}).get("matchId")
    sets = (payload or {}).get("sets")
    status = (payload or {}).get("status")

    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    if phase not in ("group", "elim"):
        return _resp(400, {"error": "phase must be group|elim"})
    if status not in ("scheduled", "in_progress", "final"):
        return _resp(400, {"error": "status invalid"})
    if not (match_id and isinstance(sets, list) and len(sets) == 5):
        return _resp(400, {"error": "matchId and exactly 5 sets required"})

    key = _p_matches(category, phase)
    mf = _get_json(key, {"matches": []})
    matches = mf.get("matches", [])

    idx = next((i for i, m in enumerate(matches) if m.get("id") == match_id), -1)
    if idx < 0:
        return _resp(404, {"error": "Match not found"})
    m = matches[idx]

    # Permission: players only on their own matches; admin any
    if auth_user.get("role") != "admin":
        if auth_user.get("playerId") not in (m.get("p1"), m.get("p2")):
            return _resp(403, {"error": "Forbidden"})

    # Normalize & validate sets
    norm_sets = []
    for s in sets:
        try:
            a = int(s.get("p1", 0))
            b = int(s.get("p2", 0))
        except Exception:
            return _resp(400, {"error": "sets must contain integers"})
        if a < 0 or b < 0 or a > 50 or b > 50:
            return _resp(400, {"error": "unreasonable set score"})
        norm_sets.append({"p1": a, "p2": b})

    who = _compute_winner(norm_sets)
    m["sets"] = norm_sets
    m["winner"] = m["p1"] if who == "p1" else (m["p2"] if who == "p2" else None)
    m["status"] = status
    m["updatedBy"] = auth_user.get("sub")
    mf["updatedAt"] = _now_iso()

    # Write back current file
    _put_json(key, mf)

    # If elimination match with advancesTo and we have a winner, propagate to next round
    if phase == "elim" and m.get("advancesTo") and m.get("winner"):
        adv = m["advancesTo"]
        # Re-read to avoid racing with ourselves (simple approach)
        emf = _get_json(key, {"matches": []})
        nxt = next((x for x in emf.get("matches", []) if x.get("id") == adv.get("matchId")), None)
        if nxt:
            nxt[adv.get("as")] = m["winner"]
            emf["updatedAt"] = _now_iso()
            _put_json(key, emf)

    return _resp(200, {"match": m})

# ---------- API: create match ----------
def create_match(payload: dict, auth_user: dict):
    """Create a new match. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    match_id = (payload or {}).get("id", "").strip()
    player1 = (payload or {}).get("player1", "").strip()
    player2 = (payload or {}).get("player2", "").strip()
    winner = (payload or {}).get("winner")
    status = (payload or {}).get("status", "pending").strip()
    sets = (payload or {}).get("sets", [])
    category = (payload or {}).get("category", "").strip()
    phase = (payload or {}).get("phase", "group").strip()
    group_id = (payload or {}).get("groupId")
    scheduled_at = (payload or {}).get("scheduledAt")
    advances_to = (payload or {}).get("advancesTo")
    
    # Validation
    if not match_id:
        return _resp(400, {"error": "match id required"})
    
    if not player1 or not player2:
        return _resp(400, {"error": "player1 and player2 required"})
    
    if player1 == player2:
        return _resp(400, {"error": "player1 and player2 must be different"})
    
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    if phase not in ("group", "elim"):
        return _resp(400, {"error": "phase must be group|elim"})
    
    if status not in ("pending", "scheduled", "in_progress", "final"):
        return _resp(400, {"error": "status must be pending|scheduled|in_progress|final"})
    
    if phase == "group" and not group_id:
        return _resp(400, {"error": "groupId required for group phase"})
    
    # Validate sets if provided
    if sets:
        if not isinstance(sets, list):
            return _resp(400, {"error": "sets must be a list"})
        
        for i, s in enumerate(sets):
            if not isinstance(s, dict):
                return _resp(400, {"error": f"set {i+1} must be an object"})
            
            try:
                p1_score = int(s.get("p1", 0))
                p2_score = int(s.get("p2", 0))
            except (ValueError, TypeError):
                return _resp(400, {"error": f"set {i+1} scores must be integers"})
            
            if p1_score < 0 or p2_score < 0 or p1_score > 50 or p2_score > 50:
                return _resp(400, {"error": f"set {i+1} scores must be between 0 and 50"})
    
    # Load existing matches
    key = _p_matches(category, phase)
    matches_data = _get_json(key, {"matches": [], "version": 1})
    existing_matches = matches_data.get("matches", [])
    
    # Check if match ID already exists
    if any(m.get("id") == match_id for m in existing_matches):
        return _resp(409, {"error": f"Match '{match_id}' already exists"})
    
    # Create new match
    new_match = {
        "id": match_id,
        "phase": phase,
        "p1": player1,
        "p2": player2,
        "sets": sets,
        "winner": winner,
        "status": status,
        "scheduledAt": scheduled_at,
        "updatedBy": auth_user.get("sub")
    }
    
    # Add phase-specific fields
    if phase == "group":
        new_match["groupId"] = group_id
    elif phase == "elim":
        new_match["roundName"] = (payload or {}).get("roundName", "")
        if advances_to:
            new_match["advancesTo"] = advances_to
    
    # Add to existing matches
    existing_matches.append(new_match)
    
    # Save matches.json
    matches_json = {
        "matches": existing_matches,
        "updatedAt": _now_iso(),
        "version": matches_data.get("version", 1) + 1
    }
    _put_json(key, matches_json)
    
    return _resp(201, {
        "success": True,
        "message": f"Match '{match_id}' created successfully",
        "match": new_match
    })

# ---------- API: update match ----------
def update_match(payload: dict, auth_user: dict):
    """Update an existing match. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    match_id = (payload or {}).get("id", "").strip()
    category = (payload or {}).get("category", "").strip()
    phase = (payload or {}).get("phase", "").strip()
    
    # Validation
    if not match_id:
        return _resp(400, {"error": "match id required"})
    
    if category and category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    if phase and phase not in ("group", "elim"):
        return _resp(400, {"error": "phase must be group|elim"})
    
    # If no category/phase provided, try to find the match in both phases
    phases_to_check = []
    if category and phase:
        phases_to_check = [(category, phase)]
    elif category:
        phases_to_check = [(category, "group"), (category, "elim")]
    elif phase:
        phases_to_check = [("man", phase), ("woman", phase)]
    else:
        phases_to_check = [("man", "group"), ("man", "elim"), ("woman", "group"), ("woman", "elim")]
    
    # Find the match
    match_found = None
    match_data = None
    match_key = None
    
    for cat, ph in phases_to_check:
        key = _p_matches(cat, ph)
        data = _get_json(key, {"matches": [], "version": 1})
        matches = data.get("matches", [])
        
        for i, match in enumerate(matches):
            if match.get("id") == match_id:
                match_found = match
                match_data = data
                match_key = key
                # Update category and phase if not provided
                if not category:
                    payload["category"] = cat
                if not phase:
                    payload["phase"] = ph
                break
        
        if match_found:
            break
    
    if not match_found:
        return _resp(404, {"error": "Match not found"})
    
    # Extract update fields
    player1 = (payload or {}).get("player1", "").strip()
    player2 = (payload or {}).get("player2", "").strip()
    winner = (payload or {}).get("winner")
    status = (payload or {}).get("status", "").strip()
    sets = (payload or {}).get("sets")
    group_id = (payload or {}).get("groupId")
    scheduled_at = (payload or {}).get("scheduledAt")
    advances_to = (payload or {}).get("advancesTo")
    round_name = (payload or {}).get("roundName")
    
    # Validation for update fields
    if player1 and player2 and player1 == player2:
        return _resp(400, {"error": "player1 and player2 must be different"})
    
    if status and status not in ("pending", "scheduled", "in_progress", "final"):
        return _resp(400, {"error": "status must be pending|scheduled|in_progress|final"})
    
    # Validate sets if provided
    if sets is not None:
        if not isinstance(sets, list):
            return _resp(400, {"error": "sets must be a list"})
        
        for i, s in enumerate(sets):
            if not isinstance(s, dict):
                return _resp(400, {"error": f"set {i+1} must be an object"})
            
            try:
                p1_score = int(s.get("p1", 0))
                p2_score = int(s.get("p2", 0))
            except (ValueError, TypeError):
                return _resp(400, {"error": f"set {i+1} scores must be integers"})
            
            if p1_score < 0 or p2_score < 0 or p1_score > 50 or p2_score > 50:
                return _resp(400, {"error": f"set {i+1} scores must be between 0 and 50"})
    
    # Update match fields (only if provided)
    if player1:
        match_found["p1"] = player1
    if player2:
        match_found["p2"] = player2
    if "winner" in payload:  # Allow setting to null
        match_found["winner"] = winner
    if status:
        match_found["status"] = status
    if sets is not None:
        match_found["sets"] = sets
    if "scheduledAt" in payload:  # Allow setting to null
        match_found["scheduledAt"] = scheduled_at
    if "groupId" in payload:  # Allow setting to null
        match_found["groupId"] = group_id
    if "advancesTo" in payload:  # Allow setting to null
        match_found["advancesTo"] = advances_to
    if round_name:
        match_found["roundName"] = round_name
    
    # Update metadata
    match_found["updatedBy"] = auth_user.get("sub")
    match_data["updatedAt"] = _now_iso()
    match_data["version"] = match_data.get("version", 1) + 1
    
    # Save updated matches
    _put_json(match_key, match_data)
    
    return _resp(200, {
        "success": True,
        "message": f"Match '{match_id}' updated successfully",
        "match": match_found
    })

# ---------- API: delete match ----------
def delete_match(payload: dict, auth_user: dict):
    """Delete an existing match. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    match_id = (payload or {}).get("id", "").strip()
    category = (payload or {}).get("category", "").strip()
    phase = (payload or {}).get("phase", "").strip()
    
    # Validation
    if not match_id:
        return _resp(400, {"error": "match id required"})
    
    if category and category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    if phase and phase not in ("group", "elim"):
        return _resp(400, {"error": "phase must be group|elim"})
    
    # If no category/phase provided, try to find the match in both phases
    phases_to_check = []
    if category and phase:
        phases_to_check = [(category, phase)]
    elif category:
        phases_to_check = [(category, "group"), (category, "elim")]
    elif phase:
        phases_to_check = [("man", phase), ("woman", phase)]
    else:
        phases_to_check = [("man", "group"), ("man", "elim"), ("woman", "group"), ("woman", "elim")]
    
    # Find the match
    match_found = None
    match_data = None
    match_key = None
    
    for cat, ph in phases_to_check:
        key = _p_matches(cat, ph)
        data = _get_json(key, {"matches": [], "version": 1})
        matches = data.get("matches", [])
        
        for i, match in enumerate(matches):
            if match.get("id") == match_id:
                match_found = match
                match_data = data
                match_key = key
                # Remove the match from the list
                matches.pop(i)
                break
        
        if match_found:
            break
    
    if not match_found:
        return _resp(404, {"error": "Match not found"})
    
    # Update metadata
    match_data["updatedAt"] = _now_iso()
    match_data["version"] = match_data.get("version", 1) + 1
    
    # Save updated matches
    _put_json(match_key, match_data)
    
    return _resp(200, {
        "success": True,
        "message": f"Match '{match_id}' deleted successfully"
    })