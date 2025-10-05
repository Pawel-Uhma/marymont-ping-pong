# bracket.py — seed bracket from standings + update elimination scores
# Exposes:
#   - seed_from_groups(payload, auth_user) -> HTTP response dict
#   - update_score(payload, auth_user)     -> HTTP response dict
#
# Files (root layout):
#   <category>/standings_group.json
#   <category>/bracket.json
#   <category>/matches_elim.json

import os, json, time, base64, boto3

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

def _now(): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
def _new_id(prefix="me"): return f"{prefix}_{base64.urlsafe_b64encode(os.urandom(5)).decode().rstrip('=')}"

# ---------- Paths ----------
def _p_standings(cat):  return f"data/{cat}/standings_group.json"
def _p_bracket(cat):    return f"data/{cat}/bracket.json"
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

# ---------- API: seed_from_groups ----------
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

    # Take top-2 from each group (if present)
    top = []
    for g in groups:
        t = g.get("table", [])
        first  = t[0]["playerId"] if len(t)>0 else None
        second = t[1]["playerId"] if len(t)>1 else None
        top.append({"first": first, "second": second})
    if not any(x["first"] for x in top) or not any(x["second"] for x in top):
        return _resp(400, {"error": "need at least two players (first and second) from groups"})

    # Seeds list (for reference/UX)
    seeds = []
    for i, g in enumerate(top):
        if g["first"]:  seeds.append({"slot": i*2+1, "playerId": g["first"]})
        if g["second"]: seeds.append({"slot": i*2+2, "playerId": g["second"]})

    # Pairings: first of group i vs second of next group (to avoid same-group in R1)
    pairs: list[tuple[str,str]] = []
    n = len(top)
    for i in range(n):
        a = top[i]["first"]
        b = top[(i+1) % n]["second"] if n>0 else None
        if a and b:
            pairs.append((a,b))

    elim_matches = []
    rounds = []

    if len(pairs) <= 1:
        # Final only
        mid = _new_id("me")
        elim_matches.append({
            "id": mid, "phase": "elim", "roundName": "Final",
            "p1": pairs[0][0] if pairs else "", "p2": pairs[0][1] if pairs else "",
            "sets": [{"p1":0,"p2":0} for _ in range(5)],
            "winner": None, "status": "scheduled",
            "advancesTo": None, "scheduledAt": None, "updatedBy": None
        })
        rounds.append({"name": "Final", "matchIds": [mid]})
    else:
        # Quarterfinals (or Round of X)
        q_ids = []
        for (p1, p2) in pairs:
            mid = _new_id("me")
            q_ids.append(mid)
            elim_matches.append({
                "id": mid, "phase": "elim", "roundName": "Quarterfinals",
                "p1": p1, "p2": p2,
                "sets": [{"p1":0,"p2":0} for _ in range(5)],
                "winner": None, "status": "scheduled"
            })
        rounds.append({"name": "Quarterfinals", "matchIds": q_ids})

        # Semifinals
        semi_ids = []
        for i in range(0, len(q_ids), 2):
            sid = _new_id("me")
            semi_ids.append(sid)
            elim_matches.append({
                "id": sid, "phase": "elim", "roundName": "Semifinals",
                "p1": "", "p2": "",
                "sets": [{"p1":0,"p2":0} for _ in range(5)],
                "winner": None, "status": "scheduled"
            })
            # wire QFs to this Semi
            if i < len(q_ids):
                q1 = next(m for m in elim_matches if m["id"] == q_ids[i])
                q1["advancesTo"] = {"matchId": sid, "as": "p1"}
            if i+1 < len(q_ids):
                q2 = next(m for m in elim_matches if m["id"] == q_ids[i+1])
                q2["advancesTo"] = {"matchId": sid, "as": "p2"}
        rounds.append({"name": "Semifinals", "matchIds": semi_ids})

        # Final
        fid = _new_id("me")
        elim_matches.append({
            "id": fid, "phase": "elim", "roundName": "Final",
            "p1": "", "p2": "",
            "sets": [{"p1":0,"p2":0} for _ in range(5)],
            "winner": None, "status": "scheduled"
        })
        rounds.append({"name": "Final", "matchIds": [fid]})
        # wire Semis to Final
        for i, sid in enumerate(semi_ids):
            sm = next(m for m in elim_matches if m["id"] == sid)
            sm["advancesTo"] = {"matchId": fid, "as": "p1" if i == 0 else "p2"}

    # Save files
    _put_json(_p_bracket(category), {"seeds": seeds, "rounds": rounds, "updatedAt": _now(), "version": 1})
    _put_json(_p_matches_elim(category), {"matches": elim_matches, "updatedAt": _now(), "version": 1})

    return _resp(200, {"seeds": seeds, "rounds": rounds, "matchesCreated": len(elim_matches)})

# ---------- API: update_score (elimination only) ----------
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

    key = _p_matches_elim(category)
    mf = _get_json(key, {"matches":[]})
    matches = mf.get("matches", [])

    idx = next((i for i,m in enumerate(matches) if m.get("id")==match_id), -1)
    if idx < 0:
        return _resp(404, {"error":"Match not found"})
    m = matches[idx]

    # Permission: player can edit only their own match; admin can edit any
    if auth_user.get("role") != "admin":
        if auth_user.get("playerId") not in (m.get("p1"), m.get("p2")):
            return _resp(403, {"error":"Forbidden"})

    # Normalize/validate sets
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

    # Persist current
    _put_json(key, mf)

    # Propagate to next match if needed
    if m.get("advancesTo") and m.get("winner"):
        emf = _get_json(key, {"matches":[]})
        nxt = next((x for x in emf.get("matches", []) if x.get("id")==m["advancesTo"]["matchId"]), None)
        if nxt:
            nxt[m["advancesTo"]["as"]] = m["winner"]
            emf["updatedAt"] = _now()
            _put_json(key, emf)

    return _resp(200, {"match": m})

def get_bracket(payload: dict):
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})
    data = _get_json(_p_bracket(category), {"seeds": [], "rounds": [], "version": 1})
    return _resp(200, data)

