# standings.py — recompute group standings from finished group matches
# Exposes:
#   - compute_standings(payload, auth_user) -> HTTP response dict
#
# S3 layout:
#   <category>/groups.json
#   <category>/matches_group.json
#   <category>/standings_group.json

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
def _p_matches_group(cat): return f"data/{cat}/matches_group.json"
def _p_standings(cat):     return f"data/{cat}/standings_group.json"

# ---- Helpers ----
def _valid_set(a:int,b:int)->bool:
    mx = max(a,b); diff = abs(a-b)
    return mx >= 11 and diff >= 2

def _accumulate(rows, pid, *, sets_for, sets_against, pts_for, pts_against, win=None):
    r = rows[pid]
    r["setsFor"]      += sets_for
    r["setsAgainst"]  += sets_against
    r["pointsFor"]    += pts_for
    r["pointsAgainst"]+= pts_against
    if win is True:  r["wins"]  += 1
    if win is False: r["losses"]+= 1

def _rank(table):
    # Sort by: wins DESC, setDiff DESC, pointDiff DESC
    table.sort(key=lambda r: (
        -r["wins"],
        - (r["setsFor"] - r["setsAgainst"]),
        - (r["pointsFor"] - r["pointsAgainst"])
    ))
    for i, r in enumerate(table, 1):
        r["rank"] = i

# ---- API ----
def compute_standings(payload:dict, auth_user:dict):
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error":"Forbidden"})
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})

    groups = _get_json(_p_groups(category), {"groups":[]}).get("groups", [])
    matches = _get_json(_p_matches_group(category), {"matches":[]}).get("matches", [])

    # Build per-group tables initialized with players
    out_groups = []
    by_group = { g["id"]: { pid: {
        "playerId": pid, "wins":0, "losses":0,
        "setsFor":0, "setsAgainst":0,
        "pointsFor":0, "pointsAgainst":0,
        "rank":0
    } for pid in g["players"] } for g in groups }

    # Consider only final group matches
    for m in (mm for mm in matches if mm.get("phase")=="group" and mm.get("status")=="final" and mm.get("groupId")):
        gmap = by_group.get(m["groupId"])
        if not gmap:  # unknown group id
            continue
        p1, p2 = m["p1"], m["p2"]
        p1s=p2s=p1p=p2p=0
        for s in m.get("sets", []):
            a, b = int(s.get("p1",0)), int(s.get("p2",0))
            p1p += a; p2p += b
            if _valid_set(a,b):
                if a>b: p1s+=1
                else:   p2s+=1
        _accumulate(gmap, p1, sets_for=p1s, sets_against=p2s, pts_for=p1p, pts_against=p2p,
                    win=True if m.get("winner")==p1 else (False if m.get("winner")==p2 else None))
        _accumulate(gmap, p2, sets_for=p2s, sets_against=p1s, pts_for=p2p, pts_against=p1p,
                    win=True if m.get("winner")==p2 else (False if m.get("winner")==p1 else None))

    # Emit sorted tables
    for g in groups:
        table = list(by_group[g["id"]].values())
        _rank(table)
        out_groups.append({ "groupId": g["id"], "table": table })

    standings = {
        "groups": out_groups,
        "tiebreakers": ["wins","setDiff","pointDiff","headToHead","random"],
        "updatedAt": _now(),
        "version": 1
    }
    _put_json(_p_standings(category), standings)
    return _resp(200, {"standings": standings})
    
def get_standings(payload: dict):
    category = (payload or {}).get("category")
    if category not in ("man","woman"):
        return _resp(400, {"error":"category must be man|woman"})
    data = _get_json(_p_standings(category), {"groups": [], "tiebreakers": ["wins","setDiff","pointDiff","headToHead","random"]})
    return _resp(200, data)