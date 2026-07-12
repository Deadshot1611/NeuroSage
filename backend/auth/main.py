"""
NeuroSage Auth Service — Flask + SQLite (local) / PostgreSQL (production)
- No DATABASE_URL set  →  uses SQLite (local dev, zero setup)
- DATABASE_URL set     →  uses PostgreSQL (Render + Neon in production)
Run: python main.py   →   http://localhost:8002
"""

import datetime
import hashlib
import hmac
import json as _json_top
import os
import secrets
import sqlite3
import urllib.parse
import urllib.request

import jwt
from flask import Flask, g, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

SECRET_KEY   = os.getenv("SECRET_KEY", "neurosage-secret-key-change-in-production")
DATABASE_URL = os.getenv("DATABASE_URL", "")
USE_PG       = DATABASE_URL.startswith(("postgresql://", "postgres://"))
DB_PATH      = os.path.join(os.path.dirname(os.path.abspath(__file__)), "neurosage_auth.db")

print(f"[auth] Database : {'PostgreSQL' if USE_PG else 'SQLite → ' + DB_PATH}")
print(f"[auth] SECRET_KEY first 10 chars: {SECRET_KEY[:10]!r}")


# ── SQL helper — write SQL with ? and this converts to %s for PostgreSQL ──────

def _sql(sql: str) -> str:
    return sql.replace("?", "%s") if USE_PG else sql


# ── Database connection (one per request via Flask g) ─────────────────────────

def get_db():
    if "db" not in g:
        if USE_PG:
            import psycopg2
            g.db = psycopg2.connect(DATABASE_URL)
        else:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            g.db = conn
    return g.db

@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db:
        if USE_PG and exc:
            try:
                db.rollback()
            except Exception:
                pass
        db.close()


# ── Query helpers ─────────────────────────────────────────────────────────────

def db_fetchone(sql: str, params=()):
    db = get_db()
    if USE_PG:
        import psycopg2.extras
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(_sql(sql), params)
        return cur.fetchone()
    return db.execute(sql, params).fetchone()

def db_fetchall(sql: str, params=()):
    db = get_db()
    if USE_PG:
        import psycopg2.extras
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(_sql(sql), params)
        return cur.fetchall()
    return db.execute(sql, params).fetchall()

def db_insert(sql: str, params=()) -> int:
    """Execute an INSERT and return the new row's id."""
    db = get_db()
    if USE_PG:
        import psycopg2.extras
        cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(_sql(sql) + " RETURNING id", params)
        db.commit()
        return cur.fetchone()["id"]
    cur = db.execute(sql, params)
    db.commit()
    return cur.lastrowid


# ── Schema creation ───────────────────────────────────────────────────────────

def init_db():
    if USE_PG:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL)
        cur  = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                name          TEXT NOT NULL,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reports (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                module      TEXT NOT NULL,
                child_name  TEXT NOT NULL,
                child_age   TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at  TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        conn.commit()
        conn.close()
    else:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    name          TEXT NOT NULL,
                    email         TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS reports (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id     INTEGER NOT NULL,
                    module      TEXT NOT NULL,
                    child_name  TEXT NOT NULL,
                    child_age   TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            conn.commit()
    print("✓ Tables ready: users, reports")


# ── Password hashing (pure Python, no bcrypt) ─────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_hex(32)
    key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}:{key.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, key_hex = stored.split(":", 1)
        new_key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
        return hmac.compare_digest(new_key.hex(), key_hex)
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

def make_token(user_id: int) -> str:
    return jwt.encode(
        {"sub": str(user_id), "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        SECRET_KEY, algorithm="HS256",
    )

def get_token_user():
    auth = request.headers.get("Authorization", "")
    print(f"[auth] Authorization header received: {repr(auth[:60])}")
    if not auth.startswith("Bearer "):
        return None, "Missing token"
    raw = auth[7:]
    try:
        payload = jwt.decode(raw, SECRET_KEY, algorithms=["HS256"])
        row = db_fetchone("SELECT * FROM users WHERE id = ?", (int(payload["sub"]),))
        return (row, None) if row else (None, "User not found")
    except jwt.ExpiredSignatureError:
        return None, "Token expired"
    except jwt.InvalidTokenError as e:
        print(f"[auth] JWT decode failed ({type(e).__name__}): {e}")
        print(f"[auth] Token start: {repr(raw[:40])}")
        print(f"[auth] SECRET_KEY in use: {SECRET_KEY[:10]!r}...")
        return None, f"Invalid token ({type(e).__name__})"


# ── Helpers ───────────────────────────────────────────────────────────────────

def row_dict(row) -> dict:
    return {"id": row["id"], "name": row["name"],
            "email": row["email"], "created_at": str(row["created_at"])}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return jsonify({"status": "NeuroSage Auth API running"})

@app.get("/health")
def health():
    return jsonify({"status": "ok"})

@app.post("/auth/register")
def register():
    data     = request.get_json(silent=True) or {}
    name     = (data.get("name") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"detail": "All fields are required"}), 400
    if len(password) < 6:
        return jsonify({"detail": "Password must be at least 6 characters"}), 400

    if db_fetchone("SELECT id FROM users WHERE email = ?", (email,)):
        return jsonify({"detail": "Email already registered"}), 400

    new_id = db_insert(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
        (name, email, hash_password(password)),
    )
    row = db_fetchone("SELECT * FROM users WHERE id = ?", (new_id,))
    return jsonify({"access_token": make_token(new_id),
                    "token_type": "bearer", "user": row_dict(row)}), 201

@app.post("/auth/login")
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    row = db_fetchone("SELECT * FROM users WHERE email = ?", (email,))
    if not row or not verify_password(password, row["password_hash"]):
        return jsonify({"detail": "Invalid email or password"}), 401

    return jsonify({"access_token": make_token(row["id"]),
                    "token_type": "bearer", "user": row_dict(row)})

@app.get("/auth/me")
def get_me():
    user, err = get_token_user()
    if err:
        return jsonify({"detail": err}), 401
    return jsonify(row_dict(user))

@app.post("/auth/logout")
def logout():
    return jsonify({"message": "Logged out successfully"})

@app.post("/auth/google")
def google_auth():
    data       = request.get_json(silent=True) or {}
    credential = (data.get("credential") or "").strip()
    if not credential:
        return jsonify({"detail": "Missing Google credential"}), 400

    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(credential)}"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            info = _json_top.loads(resp.read().decode())
    except Exception as e:
        return jsonify({"detail": f"Google token verification failed: {e}"}), 401

    if info.get("error_description"):
        return jsonify({"detail": info["error_description"]}), 401

    email = (info.get("email") or "").strip().lower()
    name  = info.get("name") or info.get("email", "").split("@")[0]
    if not email:
        return jsonify({"detail": "No email returned from Google"}), 401

    row = db_fetchone("SELECT * FROM users WHERE email = ?", (email,))
    if row:
        return jsonify({"access_token": make_token(row["id"]),
                        "token_type": "bearer", "user": row_dict(row)})

    new_id = db_insert(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
        (name, email, "GOOGLE_OAUTH"),
    )
    row = db_fetchone("SELECT * FROM users WHERE id = ?", (new_id,))
    return jsonify({"access_token": make_token(new_id),
                    "token_type": "bearer", "user": row_dict(row)}), 201


# ── Reports ───────────────────────────────────────────────────────────────────

import json as _json

@app.post("/reports")
def save_report():
    user, err = get_token_user()
    if err:
        return jsonify({"detail": err}), 401

    data       = request.get_json(silent=True) or {}
    module     = (data.get("module") or "").strip()
    child_name = (data.get("child_name") or "").strip()
    child_age  = str(data.get("child_age") or "").strip()
    result     = data.get("result_json")

    if not module or not child_name or result is None:
        return jsonify({"detail": "module, child_name and result_json are required"}), 400

    result_str = _json.dumps(result) if isinstance(result, dict) else str(result)

    try:
        new_id = db_insert(
            "INSERT INTO reports (user_id, module, child_name, child_age, result_json) VALUES (?, ?, ?, ?, ?)",
            (user["id"], module, child_name, child_age, result_str),
        )
        return jsonify({"id": new_id, "message": "Report saved"}), 201
    except Exception as e:
        print(f"[save_report] DB error: {e}")
        return jsonify({"detail": f"Database error: {str(e)}"}), 500

@app.get("/reports")
def get_reports():
    user, err = get_token_user()
    if err:
        return jsonify({"detail": err}), 401

    rows = db_fetchall(
        "SELECT id, module, child_name, child_age, result_json, created_at "
        "FROM reports WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],),
    )

    return jsonify({
        "reports": [
            {
                "id":         r["id"],
                "module":     r["module"],
                "child_name": r["child_name"],
                "child_age":  r["child_age"],
                "result":     _json.loads(r["result_json"]),
                "created_at": str(r["created_at"]),
            }
            for r in rows
        ]
    })


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("✓ Auth API starting on http://localhost:8002")
    app.run(port=8002, debug=True)
