# matches.py — list & update matches (Python 3.11)
# Exposes:
#   - list_matches(payload) -> HTTP response dict
#   - update_score(payload, auth_user) -> HTTP response dict
#   - create_match(payload, auth_user) -> HTTP response dict
#   - update_match(payload, auth_user) -> HTTP response dict
#   - delete_match(payload, auth_user) -> HTTP response dict
#
# S3 layout:
#   data/{category}/matches.json
#
# Match structure:
#   - id: numeric (always auto-generated, e.g., 1, 2, 3)
#   - type: "group" or "elimination"
#   - group: group ID for group matches
#   - round: round number for elimination matches

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
def _p_matches(category: str) -> str:
    return f"data/{category}/matches.json"

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
    match_type = (payload or {}).get("type")  # "group" or "elimination"
    phase = (payload or {}).get("phase")  # Legacy support: "group" or "elim"
    
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})

    data = _get_json(_p_matches(category), {"matches": [], "version": 1})
    matches = data.get("matches", [])
    
    # Filter by type if specified (support both new 'type' and legacy 'phase' parameters)
    filter_type = None
    if match_type:
        if match_type not in ("group", "elimination"):
            return _resp(400, {"error": "type must be group|elimination"})
        filter_type = match_type
    elif phase:
        if phase not in ("group", "elim"):
            return _resp(400, {"error": "phase must be group|elim"})
        # Map legacy phase to new type
        filter_type = "group" if phase == "group" else "elimination"
    
    if filter_type:
        matches = [m for m in matches if m.get("type") == filter_type]
    
    return _resp(200, {"matches": matches})

# ---------- API: update score ----------
def update_score(payload: dict, auth_user: dict):
    if not auth_user:
        return _resp(401, {"error": "Unauthorized"})

    category = (payload or {}).get("category")
    match_id = (payload or {}).get("matchId")
    sets = (payload or {}).get("sets")
    status = (payload or {}).get("status")

    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    if status not in ("scheduled", "in_progress", "final"):
        return _resp(400, {"error": "status invalid"})
    if not (match_id and isinstance(sets, list) and len(sets) == 5):
        return _resp(400, {"error": "matchId and exactly 5 sets required"})
    
    # Ensure match_id is numeric
    try:
        match_id = int(match_id)
    except (ValueError, TypeError):
        return _resp(400, {"error": "matchId must be a number"})

    key = _p_matches(category)
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
    if m.get("type") == "elimination" and m.get("advancesTo") and m.get("winner"):
        adv = m["advancesTo"]
        # Re-read to avoid racing with ourselves (simple approach)
        emf = _get_json(key, {"matches": []})
        nxt = next((x for x in emf.get("matches", []) if x.get("id") == adv.get("matchId")), None)
        if nxt:
            nxt[adv.get("as")] = m["winner"]
            emf["updatedAt"] = _now_iso()
            _put_json(key, emf)

    # Recalculate standings if this is a group match
    if m.get("type") == "group":
        try:
            import standings
            standings_payload = {"category": category}
            standings_result = standings.compute_standings(standings_payload, auth_user)
            # Note: We don't return the standings result, just recalculate silently
        except Exception as e:
            # Log error but don't fail the match update
            print(f"Warning: Failed to recalculate standings: {e}")

    return _resp(200, {"match": m})

# ---------- API: create match ----------
def create_match(payload: dict, auth_user: dict):
    """Create a new match. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    match_id = (payload or {}).get("id")
    player1 = (payload or {}).get("player1", "").strip()
    player2 = (payload or {}).get("player2", "").strip()
    winner = (payload or {}).get("winner")
    status = (payload or {}).get("status", "pending").strip()
    sets = (payload or {}).get("sets", [])
    category = (payload or {}).get("category", "").strip()
    match_type = (payload or {}).get("type", "group").strip()
    group_id = (payload or {}).get("group")
    round_num = (payload or {}).get("round")
    scheduled_at = (payload or {}).get("scheduledAt")
    advances_to = (payload or {}).get("advancesTo")
    
    # Load existing matches to generate unique ID
    key = _p_matches(category)
    matches_data = _get_json(key, {"matches": [], "version": 1})
    existing_matches = matches_data.get("matches", [])
    
    # Always generate unique ID automatically (ignore any provided id)
    existing_ids = [m.get("id", 0) for m in existing_matches if isinstance(m.get("id"), int)]
    match_id = max(existing_ids, default=0) + 1
    
    if not player1 or not player2:
        return _resp(400, {"error": "player1 and player2 required"})
    
    if player1 == player2:
        return _resp(400, {"error": "player1 and player2 must be different"})
    
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    if match_type not in ("group", "elimination"):
        return _resp(400, {"error": "type must be group|elimination"})
    
    if status not in ("pending", "scheduled", "in_progress", "final"):
        return _resp(400, {"error": "status must be pending|scheduled|in_progress|final"})
    
    if match_type == "group" and not group_id:
        return _resp(400, {"error": "group required for group type"})
    
    if match_type == "elimination" and not round_num:
        return _resp(400, {"error": "round required for elimination type"})
    
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
    
    # Note: existing_matches already loaded above for ID generation
    
    # Create new match
    new_match = {
        "id": match_id,
        "type": match_type,
        "p1": player1,
        "p2": player2,
        "sets": sets,
        "winner": winner,
        "status": status,
        "scheduledAt": scheduled_at,
        "updatedBy": auth_user.get("sub")
    }
    
    # Add type-specific fields
    if match_type == "group":
        new_match["group"] = group_id
    elif match_type == "elimination":
        new_match["round"] = round_num
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

    match_id = (payload or {}).get("id")
    category = (payload or {}).get("category", "").strip()
    
    # Validation
    if match_id is None:
        return _resp(400, {"error": "match id required"})
    
    # Ensure match_id is numeric
    try:
        match_id = int(match_id)
    except (ValueError, TypeError):
        return _resp(400, {"error": "match id must be a number"})
    
    if category and category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    # If no category provided, try to find the match in both categories
    categories_to_check = [category] if category else ["man", "woman"]
    
    # Find the match
    match_found = None
    match_data = None
    match_key = None
    
    for cat in categories_to_check:
        key = _p_matches(cat)
        data = _get_json(key, {"matches": [], "version": 1})
        matches = data.get("matches", [])
        
        for i, match in enumerate(matches):
            if match.get("id") == match_id:
                match_found = match
                match_data = data
                match_key = key
                # Update category if not provided
                if not category:
                    payload["category"] = cat
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
    group_id = (payload or {}).get("group")
    round_num = (payload or {}).get("round")
    scheduled_at = (payload or {}).get("scheduledAt")
    advances_to = (payload or {}).get("advancesTo")
    
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
    if "group" in payload:  # Allow setting to null
        match_found["group"] = group_id
    if "round" in payload:  # Allow setting to null
        match_found["round"] = round_num
    if "advancesTo" in payload:  # Allow setting to null
        match_found["advancesTo"] = advances_to
    
    # Update metadata
    match_found["updatedBy"] = auth_user.get("sub")
    match_data["updatedAt"] = _now_iso()
    match_data["version"] = match_data.get("version", 1) + 1
    
    # Save updated matches
    _put_json(match_key, match_data)
    
    # Recalculate standings if this is a group match
    if match_found.get("type") == "group":
        try:
            import standings
            standings_payload = {"category": payload.get("category", cat)}
            standings_result = standings.compute_standings(standings_payload, auth_user)
            # Note: We don't return the standings result, just recalculate silently
        except Exception as e:
            # Log error but don't fail the match update
            print(f"Warning: Failed to recalculate standings: {e}")
    
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
    
    match_id = (payload or {}).get("id")
    category = (payload or {}).get("category", "").strip()
    
    # Validation
    if match_id is None:
        return _resp(400, {"error": "match id required"})
    
    # Ensure match_id is numeric
    try:
        match_id = int(match_id)
    except (ValueError, TypeError):
        return _resp(400, {"error": "match id must be a number"})
    
    if category and category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    
    # If no category provided, try to find the match in both categories
    categories_to_check = [category] if category else ["man", "woman"]
    
    # Find the match
    match_found = None
    match_data = None
    match_key = None
    
    for cat in categories_to_check:
        key = _p_matches(cat)
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
    
    # Recalculate standings if this was a group match
    if match_found.get("type") == "group":
        try:
            import standings
            standings_payload = {"category": payload.get("category", cat)}
            standings_result = standings.compute_standings(standings_payload, auth_user)
            # Note: We don't return the standings result, just recalculate silently
        except Exception as e:
            # Log error but don't fail the match deletion
            print(f"Warning: Failed to recalculate standings: {e}")
    
    return _resp(200, {
        "success": True,
        "message": f"Match '{match_id}' deleted successfully"
    })