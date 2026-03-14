# bracket.py — bracket management for tournament playoffs
# Exposes:
#   - create_bracket(payload, auth_user)         -> HTTP response dict
#   - get_bracket_with_matches(payload)           -> HTTP response dict
#   - reset_bracket(payload, auth_user)           -> HTTP response dict
#   - seed_from_groups(payload, auth_user)        -> HTTP response dict
#   - update_score(payload, auth_user)            -> HTTP response dict
#
# Storage:
#   data/{category}/bracket_{bracketType}.json   (bracket structure)
#   data/{category}/matches.json                 (elimination matches alongside group matches)

import os, json, time, boto3

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
DATA_BUCKET  = os.environ.get("DATA_BUCKET", "marymont-ping-pong")
S3 = boto3.client("s3")

# ---------- HTTP ----------
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

# ---------- S3 JSON ----------
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

def _delete_key(key:str):
    try:
        S3.delete_object(Bucket=DATA_BUCKET, Key=key)
    except Exception:
        pass

def _now(): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# ---------- Paths ----------
def _p_bracket(cat, btype="main"):
    return f"data/{cat}/bracket_{btype}.json"

def _p_matches(cat):
    return f"data/{cat}/matches.json"

# Legacy paths (for backward compat with seed_from_groups / old update_score)
def _p_standings(cat):  return f"data/{cat}/standings_group.json"
def _p_matches_elim(c): return f"data/{c}/matches_elim.json"

# ---------- Scoring ----------
def _valid_set(a:int,b:int)->bool:
    mx = max(a,b); diff = abs(a-b)
    return mx >= 11 and diff >= 2

def _winner_side(sets)->str|None:
    w1=w2=0
    for s in sets:
        a=int(s.get("p1",0)); b=int(s.get("p2",0))
        if not _valid_set(a,b): continue
        if a>b: w1+=1
        else:   w2+=1
    if w1>=3: return "p1"
    if w2>=3: return "p2"
    return None

# ---------- Valid combos ----------
_VALID_COMBOS = {("man","main"), ("woman","main"), ("man","tds")}

def _validate_combo(category, bracket_type):
    if category not in ("man","woman"):
        return _resp(400, {"error": "category must be man|woman"})
    if bracket_type not in ("main","tds"):
        return _resp(400, {"error": "bracketType must be main|tds"})
    if (category, bracket_type) not in _VALID_COMBOS:
        return _resp(400, {"error": f"Invalid combo: {category}/{bracket_type}"})
    return None

# ---------- Round structure ----------
def _get_structure(category, bracket_type):
    """Returns list of (roundName, matchCount) tuples."""
    if category == "woman" and bracket_type == "main":
        return [("Półfinały", 2), ("Finał", 1)]
    else:
        # man/main or man/tds: QF -> SF -> Final
        return [("Ćwierćfinały", 4), ("Półfinały", 2), ("Finał", 1)]

# ---------- API: create_bracket ----------
def create_bracket(payload:dict, auth_user:dict):
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Forbidden"})

    category = (payload or {}).get("category")
    bracket_type = (payload or {}).get("bracketType", "main")
    slots = (payload or {}).get("slots", [])

    err = _validate_combo(category, bracket_type)
    if err:
        return err

    structure = _get_structure(category, bracket_type)
    first_round_count = structure[0][1]
    expected_players = first_round_count * 2

    if len(slots) != expected_players:
        return _resp(400, {"error": f"Expected {expected_players} slots, got {len(slots)}"})

    # Read existing matches to get next ID
    matches_key = _p_matches(category)
    mf = _get_json(matches_key, {"matches": [], "version": 1})
    existing_matches = mf.get("matches", [])
    existing_ids = [m.get("id", 0) for m in existing_matches if isinstance(m.get("id"), int)]
    next_id = max(existing_ids, default=0) + 1

    # Build all elimination matches
    elim_matches = []
    rounds_meta = []
    all_round_ids = []  # list of lists: [[qf_ids], [sf_ids], [final_id]]

    for round_name, match_count in structure:
        round_ids = []
        for _ in range(match_count):
            mid = next_id
            next_id += 1
            round_ids.append(mid)
            elim_matches.append({
                "id": mid,
                "type": "elimination",
                "bracketType": bracket_type,
                "roundName": round_name,
                "p1": "",
                "p2": "",
                "sets": [{"p1": 0, "p2": 0} for _ in range(5)],
                "winner": None,
                "status": "scheduled",
                "advancesTo": None,
                "scheduledAt": None,
                "updatedBy": None,
            })
        all_round_ids.append(round_ids)
        rounds_meta.append({"name": round_name, "matchIds": round_ids})

    # Wire advancesTo: each pair in round N feeds into round N+1
    for ri in range(len(all_round_ids) - 1):
        src_ids = all_round_ids[ri]
        dst_ids = all_round_ids[ri + 1]
        for i, src_id in enumerate(src_ids):
            dst_idx = i // 2
            slot = "p1" if i % 2 == 0 else "p2"
            src_match = next(m for m in elim_matches if m["id"] == src_id)
            src_match["advancesTo"] = {"matchId": dst_ids[dst_idx], "as": slot}

    # Assign players from slots to first-round matches
    first_round_ids = all_round_ids[0]
    # slots is expected as [{position: 1, playerId: "p_xxx"}, ...]
    # Sort by position to ensure correct ordering
    sorted_slots = sorted(slots, key=lambda s: s.get("position", 0))
    for i, slot_data in enumerate(sorted_slots):
        match_idx = i // 2
        player_slot = "p1" if i % 2 == 0 else "p2"
        match = next(m for m in elim_matches if m["id"] == first_round_ids[match_idx])
        match[player_slot] = slot_data.get("playerId", "")

    # Build seeds for bracket metadata
    seeds = [{"slot": s.get("position", i+1), "playerId": s.get("playerId", "")} for i, s in enumerate(sorted_slots)]

    # Append matches to matches.json
    existing_matches.extend(elim_matches)
    mf["matches"] = existing_matches
    mf["updatedAt"] = _now()
    _put_json(matches_key, mf)

    # Save bracket structure
    bracket_data = {
        "seeds": seeds,
        "rounds": rounds_meta,
        "bracketType": bracket_type,
        "category": category,
        "updatedAt": _now(),
        "version": 1,
    }
    _put_json(_p_bracket(category, bracket_type), bracket_data)

    return _resp(200, {
        "bracket": bracket_data,
        "matchesCreated": len(elim_matches),
    })

# ---------- API: get_bracket_with_matches ----------
def get_bracket_with_matches(payload:dict):
    category = (payload or {}).get("category")
    bracket_type = (payload or {}).get("bracketType", "main")

    if category not in ("man","woman"):
        return _resp(400, {"error": "category must be man|woman"})
    if bracket_type not in ("main","tds"):
        return _resp(400, {"error": "bracketType must be main|tds"})

    bracket = _get_json(_p_bracket(category, bracket_type), None)
    if not bracket:
        return _resp(200, {"bracket": None, "matches": []})

    # Get elimination matches for this bracketType from matches.json
    mf = _get_json(_p_matches(category), {"matches": []})
    all_matches = mf.get("matches", [])
    elim_matches = [
        m for m in all_matches
        if m.get("type") == "elimination" and m.get("bracketType") == bracket_type
    ]

    # Load players for name resolution
    players_data = _get_json(f"data/{category}/players.json", {"players": []})
    # Also load from accounts for name resolution
    accounts_data = _get_json("data/accounts.json", {"users": []})

    # Build player name map
    player_names = {}
    for p in players_data.get("players", []):
        pid = p.get("id") or p.get("playerId")
        if pid:
            player_names[str(pid)] = f"{p.get('name','')} {p.get('surname','')}".strip()
    for u in accounts_data.get("users", []):
        pid = u.get("playerId")
        if pid is not None:
            player_names[str(pid)] = f"{u.get('name','')} {u.get('surname','')}".strip()

    # Attach player names to matches for convenience
    for m in elim_matches:
        m["p1Name"] = player_names.get(str(m.get("p1", "")), "")
        m["p2Name"] = player_names.get(str(m.get("p2", "")), "")

    return _resp(200, {"bracket": bracket, "matches": elim_matches})

# ---------- API: reset_bracket ----------
def reset_bracket(payload:dict, auth_user:dict):
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Forbidden"})

    category = (payload or {}).get("category")
    bracket_type = (payload or {}).get("bracketType", "main")

    err = _validate_combo(category, bracket_type)
    if err:
        return err

    # Remove associated elimination matches from matches.json
    matches_key = _p_matches(category)
    mf = _get_json(matches_key, {"matches": [], "version": 1})
    original_count = len(mf.get("matches", []))
    mf["matches"] = [
        m for m in mf.get("matches", [])
        if not (m.get("type") == "elimination" and m.get("bracketType") == bracket_type)
    ]
    removed = original_count - len(mf["matches"])
    mf["updatedAt"] = _now()
    _put_json(matches_key, mf)

    # Delete bracket file
    _delete_key(_p_bracket(category, bracket_type))

    return _resp(200, {"removed": removed})

# ---------- API: seed_from_groups (legacy, kept for backward compat) ----------
def seed_from_groups(payload:dict, auth_user:dict):
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Forbidden"})
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error": "category must be man|woman"})

    sfile = _get_json(_p_standings(category), {"groups":[]})
    groups = sfile.get("groups", [])
    if not groups:
        return _resp(400, {"error": "no standings available"})

    top = []
    for g in groups:
        t = g.get("table", [])
        first  = t[0]["playerId"] if len(t)>0 else None
        second = t[1]["playerId"] if len(t)>1 else None
        top.append({"first": first, "second": second})
    if not any(x["first"] for x in top) or not any(x["second"] for x in top):
        return _resp(400, {"error": "need at least two players (first and second) from groups"})

    seeds = []
    for i, g in enumerate(top):
        if g["first"]:  seeds.append({"slot": i*2+1, "playerId": g["first"]})
        if g["second"]: seeds.append({"slot": i*2+2, "playerId": g["second"]})

    # Build slots for create_bracket
    slots = [{"position": s["slot"], "playerId": s["playerId"]} for s in seeds]

    # Pad to expected count
    structure = _get_structure(category, "main")
    expected = structure[0][1] * 2
    while len(slots) < expected:
        slots.append({"position": len(slots)+1, "playerId": ""})

    # Use create_bracket internally
    create_payload = {
        "category": category,
        "bracketType": "main",
        "slots": slots,
    }
    return create_bracket(create_payload, auth_user)

# ---------- API: update_score (elimination only — legacy path via bracket.updateScore) ----------
def update_score(payload:dict, auth_user:dict):
    if not auth_user:
        return _resp(401, {"error": "Unauthorized"})
    category = (payload or {}).get("category")
    match_id = (payload or {}).get("matchId")
    sets = (payload or {}).get("sets")
    status = (payload or {}).get("status")

    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})
    if status not in ("scheduled","in_progress","final"):
        return _resp(400, {"error":"status invalid"})
    if not (match_id and isinstance(sets, list) and len(sets)==5):
        return _resp(400, {"error":"matchId and exactly 5 sets required"})

    # Try new matches.json first
    key = _p_matches(category)
    mf = _get_json(key, {"matches":[]})
    matches = mf.get("matches", [])

    # Try to find by numeric id
    try:
        numeric_id = int(match_id)
    except (ValueError, TypeError):
        numeric_id = None

    idx = next((i for i,m in enumerate(matches) if m.get("id")==match_id or (numeric_id is not None and m.get("id")==numeric_id)), -1)

    if idx < 0:
        # Fallback to legacy matches_elim.json
        key = _p_matches_elim(category)
        mf = _get_json(key, {"matches":[]})
        matches = mf.get("matches", [])
        idx = next((i for i,m in enumerate(matches) if m.get("id")==match_id), -1)

    if idx < 0:
        return _resp(404, {"error":"Match not found"})
    m = matches[idx]

    if auth_user.get("role") != "admin":
        if auth_user.get("playerId") not in (m.get("p1"), m.get("p2")):
            return _resp(403, {"error":"Forbidden"})

    norm = []
    for s in sets:
        try:
            a = int(s.get("p1",0)); b = int(s.get("p2",0))
        except Exception:
            return _resp(400, {"error":"sets must contain integers"})
        if a<0 or b<0 or a>50 or b>50:
            return _resp(400, {"error":"unreasonable set score"})
        norm.append({"p1":a,"p2":b})

    side = _winner_side(norm)
    m["sets"] = norm
    m["winner"] = m["p1"] if side=="p1" else (m["p2"] if side=="p2" else None)
    m["status"] = status
    m["updatedBy"] = auth_user.get("sub")
    mf["updatedAt"] = _now()
    _put_json(key, mf)

    # Propagate to next match
    if m.get("advancesTo") and m.get("winner"):
        emf = _get_json(key, {"matches":[]})
        adv = m["advancesTo"]
        adv_id = adv.get("matchId")
        # Try numeric comparison
        try:
            adv_id_num = int(adv_id)
        except (ValueError, TypeError):
            adv_id_num = None
        nxt = next((x for x in emf.get("matches", []) if x.get("id")==adv_id or (adv_id_num is not None and x.get("id")==adv_id_num)), None)
        if nxt:
            nxt[adv["as"]] = m["winner"]
            emf["updatedAt"] = _now()
            _put_json(key, emf)

    return _resp(200, {"match": m})

# ---------- API: get_bracket (legacy, kept for backward compat) ----------
def get_bracket(payload: dict):
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})
    # Try new path first
    data = _get_json(_p_bracket(category, "main"), None)
    if data:
        return _resp(200, data)
    # Fallback to legacy path
    data = _get_json(f"data/{category}/bracket.json", {"seeds": [], "rounds": [], "version": 1})
    return _resp(200, data)
