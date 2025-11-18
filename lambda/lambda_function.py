# lambda_function.py — Orchestrator (Python 3.11)
# Routes actions to feature modules. Implements CORS, method detection, JSON parsing, and error handling.

import json
import os
import base64
import time
import boto3

# --- Config (kept here so modules can import from os.environ as well) ---
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
DATA_BUCKET = os.environ.get("DATA_BUCKET", "marymont-ping-pong")
JWT_SECRET = os.environ.get("JWT_SECRET", "changeme")  # used by auth.py

# Make a single shared S3 client to pass into modules if they need it
S3 = boto3.client("s3")

# --- HTTP helpers ---
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

def _no_content():
    return {
        "statusCode": 204,
        "headers": {
            "Access-Control-Allow-Origin": CORS_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": "",
    }

# --- Import feature modules ---
# (These files will be provided next.)
import auth       # provides: login(payload), verify_from_header(headers), list_accounts(payload, auth_user), create_account(payload, auth_user), delete_account(payload, auth_user), update_account(payload, auth_user)
import groups     # provides: list_groups(payload), generate_groups(payload, auth_user)
import matches    # provides: list_matches(payload), update_score(payload, auth_user)
import standings  # provides: compute_standings(payload, auth_user)
import bracket    # provides: seed_from_groups(payload, auth_user), update_score(payload, auth_user)

# --- Router ---
def handler(event, context):
    """
    Expects JSON body: { "action": "<name>", "payload": {...} }
    - auth comes from Authorization: Bearer <token> (handled by auth.verify_from_header)
    - Supports Function URL / API Gateway v2 event shapes
    """
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod", "GET")).upper()

    if method == "OPTIONS":
        return _no_content()

    if method == "GET":
        # health
        return _resp(200, {"ok": True, "ts": int(time.time())})

    if method != "POST":
        return _resp(405, {"error": "Method not allowed"})

    # --- Parse body (handle base64 if present) ---
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return _resp(400, {"error": "Invalid JSON"})

    action = body.get("action")
    payload = body.get("payload", {}) or {}

    # --- Extract auth (dict or None) ---
    headers = event.get("headers", {}) or {}
    auth_user = auth.verify_from_header(headers)  # returns dict like {"sub":..., "role":..., "playerId":...} or None

    try:
        # --- Auth ---
        if action == "auth.login":
            return auth.login(payload)

        if action == "auth.me":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return _resp(200, auth_user)

        # --- Accounts ---
        if action == "accounts.list":
            return auth.list_accounts(payload, auth_user)

        if action == "accounts.create":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return auth.create_account(payload, auth_user)

        if action == "accounts.delete":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return auth.delete_account(payload, auth_user)

        if action == "accounts.update":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return auth.update_account(payload, auth_user)

        if action == "accounts.changePassword":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return auth.change_password(payload, auth_user)

        # --- Players (now handled through accounts) ---
        if action == "players.list":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return auth.list_players(payload, auth_user)

        # --- Groups ---
        if action == "groups.list":
            return groups.list_groups(payload)

        if action == "groups.generate":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return groups.generate_groups(payload, auth_user)

        if action == "groups.create":
            return groups.create_group(payload, auth_user)

        # --- Matches ---
        if action == "matches.list":
            return matches.list_matches(payload)

        if action == "matches.create":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return matches.create_match(payload, auth_user)

        if action == "matches.update":
            return matches.update_match(payload, auth_user)

        if action == "matches.delete":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return matches.delete_match(payload, auth_user)

        if action == "matches.updateScore":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return matches.update_score(payload, auth_user)

        # --- Standings ---
        if action == "standings.compute":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return standings.compute_standings(payload, auth_user)

        if action == "standings.get":
            return standings.get_standings(payload)

        # --- Bracket ---
        if action == "bracket.seedFromGroups":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return bracket.seed_from_groups(payload, auth_user)

        if action == "bracket.updateScore":
            if not auth_user:
                return _resp(401, {"error": "Unauthorized"})
            return bracket.update_score(payload, auth_user)

        if action == "bracket.get":
            return bracket.get_bracket(payload)
            
        return _resp(400, {"error": "Unknown action"})




    except Exception as e:
        # Log to CloudWatch; return generic error
        print("ERROR:", repr(e))
        return _resp(500, {"error": "Internal error"})
