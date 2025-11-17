# auth.py — authentication module for Lambda (Python 3.11)
# - Plaintext passwords (as requested)
# - Minimal HMAC-signed token (not real JWT, but "JWT-like")
# - Reads S3: data/accounts.json (fallback to accounts.json)
# Exposes:
#   - login(payload) -> HTTP response dict
#   - verify_from_header(headers) -> dict | None

import os
import json
import time
import hmac
import base64
import hashlib
import boto3

# --- Config / clients ---
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
DATA_BUCKET = os.environ.get("DATA_BUCKET", "marymont-ping-pong")
JWT_SECRET = os.environ.get("JWT_SECRET", "changeme")
S3 = boto3.client("s3")

# --- HTTP helper ---
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

# --- Tiny token (HMAC over JSON payload) ---
def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def _b64d(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def _sign_token(payload: dict, exp_s: int = 86400) -> str:
    payload = {**payload, "exp": int(time.time()) + exp_s}
    p = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(JWT_SECRET.encode(), p, hashlib.sha256).digest()
    return f"{_b64e(p)}.{_b64e(sig)}"

def _verify_token(token: str):
    try:
        p_enc, s_enc = token.split(".")
        p = _b64d(p_enc)
        expected = hmac.new(JWT_SECRET.encode(), p, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(s_enc)):
            return None
        payload = json.loads(p.decode())
        if int(time.time()) > int(payload.get("exp", 0)):
            return None
        return payload  # dict: {sub, role, playerId?, exp}
    except Exception:
        return None

def verify_from_header(headers: dict):
    """Extracts Authorization: Bearer <token> and verifies it.
       Returns payload dict or None."""
    if not headers:
        return None
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    return _verify_token(token)

# --- S3 JSON helpers ---
def _get_json(key: str, default):
    try:
        obj = S3.get_object(Bucket=DATA_BUCKET, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except Exception as e:
        if getattr(e, "response", {}).get("Error", {}).get("Code") in ("NoSuchKey", "404"):
            return default
        raise

def _load_accounts():
    # Prefer namespaced path; fall back to root for convenience.
    data = _get_json("data/accounts.json", None)
    if data is None:
        data = _get_json("accounts.json", {"users": []})
    return data

def _save_accounts(accounts: dict):
    """Save accounts to S3. Prefers data/accounts.json path."""
    import time
    accounts["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    accounts["version"] = accounts.get("version", 1) + 1
    
    json_data = json.dumps(accounts, ensure_ascii=False, indent=2)
    S3.put_object(
        Bucket=DATA_BUCKET,
        Key="data/accounts.json",
        Body=json_data.encode("utf-8"),
        ContentType="application/json"
    )

# --- Action: auth.login ---
def login(payload: dict):
    username = (payload or {}).get("username", "").strip()
    if not username:
        return _resp(400, {"error": "username required"})

    accounts = _load_accounts()
    user = next((u for u in accounts.get("users", []) if u.get("username") == username), None)
    if not user:
        return _resp(401, {"error": "Invalid credentials"})

    token = _sign_token({"sub": username, "role": user.get("role"), "playerId": user.get("playerId")})
    return _resp(200, {"token": token, "role": user.get("role"), "playerId": user.get("playerId")})

# --- Action: accounts.list ---
def list_accounts(payload: dict, auth_user: dict):
    """List accounts, optionally filtered by category. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    category = (payload or {}).get("category", "").strip()
    if category and category not in ["man", "woman"]:
        return _resp(400, {"error": "category must be 'man' or 'woman'"})
    
    accounts = _load_accounts()
    # Return accounts without passwords for security
    safe_accounts = []
    for user in accounts.get("users", []):
        # Filter by category if specified
        if category and user.get("category") != category:
            continue
            
        safe_user = {
            "username": user.get("username"),
            "name": user.get("name"),
            "surname": user.get("surname"),
            "role": user.get("role"),
            "playerId": user.get("playerId"),
            "category": user.get("category")
        }
        safe_accounts.append(safe_user)
    
    return _resp(200, {
        "success": True,
        "accounts": safe_accounts,
        "updatedAt": accounts.get("updatedAt"),
        "version": accounts.get("version")
    })

# --- Action: accounts.create ---
def create_account(payload: dict, auth_user: dict):
    """Create a new account. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    username = (payload or {}).get("username", "").strip()
    password = (payload or {}).get("password", "")  # Optional, can be empty
    name = (payload or {}).get("name", "").strip()
    surname = (payload or {}).get("surname", "").strip()
    role = (payload or {}).get("role", "player").strip()
    player_id = (payload or {}).get("playerId")
    category = (payload or {}).get("category", "man").strip()
    
    # Validation
    if not username:
        return _resp(400, {"error": "username required"})
    
    if not name or not surname:
        return _resp(400, {"error": "name and surname required"})
    
    if role not in ["admin", "player"]:
        return _resp(400, {"error": "role must be 'admin' or 'player'"})
    
    if category not in ["man", "woman"]:
        return _resp(400, {"error": "category must be 'man' or 'woman'"})
    
    if role == "player" and not player_id:
        return _resp(400, {"error": "playerId required for player role"})
    
    # Load existing accounts
    accounts = _load_accounts()
    
    # Check if username already exists
    if any(user.get("username") == username for user in accounts.get("users", [])):
        return _resp(409, {"error": "Username already exists"})
    
    # Check if playerId already exists (for players)
    if role == "player" and any(user.get("playerId") == player_id for user in accounts.get("users", [])):
        return _resp(409, {"error": "Player ID already exists"})
    
    # Create new user
    new_user = {
        "username": username,
        "password": password,  # Plaintext as per existing requirement
        "name": name,
        "surname": surname,
        "role": role,
        "playerId": player_id,
        "category": category
    }
    
    # Add to accounts
    if "users" not in accounts:
        accounts["users"] = []
    accounts["users"].append(new_user)
    
    # Save to S3
    _save_accounts(accounts)
    
    # Return created user (without password)
    safe_user = {
        "username": new_user["username"],
        "name": new_user["name"],
        "surname": new_user["surname"],
        "role": new_user["role"],
        "playerId": new_user["playerId"],
        "category": new_user["category"]
    }
    
    return _resp(201, {
        "success": True,
        "message": "Account created successfully",
        "account": safe_user
    })

# --- Action: accounts.delete ---
def delete_account(payload: dict, auth_user: dict):
    """Delete an account. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    username = (payload or {}).get("username", "").strip()
    if not username:
        return _resp(400, {"error": "username required"})
    
    # Prevent admin from deleting themselves
    if username == auth_user.get("sub"):
        return _resp(400, {"error": "Cannot delete your own account"})
    
    # Load existing accounts
    accounts = _load_accounts()
    
    # Find and remove the user
    original_count = len(accounts.get("users", []))
    accounts["users"] = [user for user in accounts.get("users", []) if user.get("username") != username]
    
    if len(accounts["users"]) == original_count:
        return _resp(404, {"error": "Account not found"})
    
    # Save to S3
    _save_accounts(accounts)
    
    return _resp(200, {
        "success": True,
        "message": f"Account '{username}' deleted successfully"
    })

# --- Action: accounts.update ---
def update_account(payload: dict, auth_user: dict):
    """Update an account. Requires admin role."""
    if not auth_user or auth_user.get("role") != "admin":
        return _resp(403, {"error": "Admin access required"})
    
    username = (payload or {}).get("username", "").strip()
    new_name = (payload or {}).get("name", "").strip()
    new_surname = (payload or {}).get("surname", "").strip()
    new_role = (payload or {}).get("role", "").strip()
    new_player_id = (payload or {}).get("playerId")
    new_category = (payload or {}).get("category", "").strip()
    
    if not username:
        return _resp(400, {"error": "username required"})
    
    if new_role and new_role not in ["admin", "player"]:
        return _resp(400, {"error": "role must be 'admin' or 'player'"})
    
    if new_category and new_category not in ["man", "woman"]:
        return _resp(400, {"error": "category must be 'man' or 'woman'"})
    
    if new_role == "player" and not new_player_id:
        return _resp(400, {"error": "playerId required for player role"})
    
    # Load existing accounts
    accounts = _load_accounts()
    
    # Find the user to update
    user_found = False
    for user in accounts.get("users", []):
        if user.get("username") == username:
            user_found = True
            # Update fields if provided
            if new_name:
                user["name"] = new_name
            if new_surname:
                user["surname"] = new_surname
            if new_role:
                user["role"] = new_role
            if new_category:
                user["category"] = new_category
            if "playerId" in payload:  # Allow setting to null
                user["playerId"] = new_player_id
            break
    
    if not user_found:
        return _resp(404, {"error": "Account not found"})
    
    # Save to S3
    _save_accounts(accounts)
    
    # Return updated user (without password)
    updated_user = {
        "username": username,
        "name": new_name if new_name else None,
        "surname": new_surname if new_surname else None,
        "role": new_role if new_role else None,
        "playerId": new_player_id,
        "category": new_category if new_category else None
    }
    
    return _resp(200, {
        "success": True,
        "message": f"Account '{username}' updated successfully",
        "account": updated_user
    })

# --- Action: players.list ---
def list_players(payload: dict, auth_user: dict):
    """List all player accounts. Requires authentication."""
    if not auth_user:
        return _resp(401, {"error": "Unauthorized"})
    
    category = (payload or {}).get("category", "man").strip()
    if category not in ["man", "woman"]:
        return _resp(400, {"error": "category must be 'man' or 'woman'"})
    
    accounts = _load_accounts()
    
    # Filter for player accounts in the specified category
    player_accounts = []
    for user in accounts.get("users", []):
        if user.get("role") == "player" and user.get("category") == category:
            safe_user = {
                "id": f"p_{user.get('playerId'):03d}",  # Format as p_001, p_002, etc.
                "name": user.get("name"),
                "surname": user.get("surname"),
                "category": user.get("category"),
                "username": user.get("username"),
                "playerId": user.get("playerId")
            }
            player_accounts.append(safe_user)
    
    return _resp(200, {
        "success": True,
        "players": player_accounts,
        "updatedAt": accounts.get("updatedAt"),
        "version": accounts.get("version")
    })