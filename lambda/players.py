# players.py — list/create players (Python 3.11)
# Exposes:
#   - list_players(payload) -> HTTP response dict
#   - create_player(payload, auth_user) -> HTTP response dict
#
# S3 layout (root):
#   accounts.json
#   man/players.json
#   woman/players.json

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

def _new_player_id() -> str:
    return "p_" + base64.urlsafe_b64encode(os.urandom(4)).decode().rstrip("=")

# ---------- Paths ----------
def _p_players(category: str) -> str:
    # data folders: data/man/, data/woman/
    return f"data/{category}/players.json"

def _p_accounts() -> str:
    return "data/accounts.json"

# ---------- Public: list players ----------
def list_players(payload: dict):
    category = (payload or {}).get("category")
    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})

    data = _get_json(_p_players(category), {"players": [], "version": 1})
    return _resp(200, {"players": data.get("players", [])})

# ---------- Admin: create player + account ----------
def create_player(payload: dict, auth_user: dict):
    # Double-check role (orchestrator already checks, but be safe)
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Forbidden"})

    name = (payload or {}).get("name", "").strip()
    surname = (payload or {}).get("surname", "").strip()
    category = (payload or {}).get("category")
    username = (payload or {}).get("username", "").strip()
    password = (payload or {}).get("password", "")  # Optional, can be empty

    if category not in ("man", "woman"):
        return _resp(400, {"error": "category must be man|woman"})
    if not (name and surname and username):
        return _resp(400, {"error": "name, surname, username required"})

    # Load players
    players_file = _get_json(_p_players(category), {"players": [], "version": 1})
    pid = _new_player_id()
    players_file["players"].append({
        "id": pid,
        "name": name,
        "surname": surname,
        "category": category
    })
    players_file["updatedAt"] = _now_iso()
    players_file["version"] = int(players_file.get("version", 0)) + 1
    _put_json(_p_players(category), players_file)

    # Load accounts (plaintext password by your requirement)
    accounts = _get_json(_p_accounts(), {"users": [], "version": 1})
    if any(u.get("username") == username for u in accounts.get("users", [])):
        return _resp(409, {"error": "username exists"})
    accounts["users"].append({
        "username": username,
        "password": password,
        "role": "player",
        "playerId": pid
    })
    accounts["updatedAt"] = _now_iso()
    accounts["version"] = int(accounts.get("version", 0)) + 1
    _put_json(_p_accounts(), accounts)

    return _resp(200, {"playerId": pid, "username": username})
