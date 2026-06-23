import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit.db")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                time TEXT,
                message TEXT,
                type TEXT
            )
        """)
        conn.commit()

def add_audit_log(time_str: str, message: str, log_type: str):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO audit_logs (time, message, type) VALUES (?, ?, ?)",
            (time_str, message, log_type)
        )
        conn.commit()

def get_audit_logs():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT time, message, type FROM audit_logs ORDER BY id DESC")
        rows = cursor.fetchall()
        return [{"time": r[0], "message": r[1], "type": r[2]} for r in rows]

def clear_audit_logs():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM audit_logs")
        conn.commit()
