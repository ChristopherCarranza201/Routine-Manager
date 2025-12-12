# app/worker/dispatcher.py

import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from supabase import create_client, Client

from app.core.whatsapp import send_template_positional, WhatsAppError

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")  # necesario para worker
META_WA_TOKEN = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_ID = os.getenv("META_WA_PHONE_ID", "")

POLL_SECONDS = int(os.getenv("DISPATCHER_POLL_SECONDS", "30"))

def _sb() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en .env")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _fetch_due_notifications(sb: Client, limit: int = 50) -> List[Dict[str, Any]]:
    # Solo canal WhatsApp, status scheduled, active true o null, y fecha vencida
    res = (
        sb.table("notifications")
        .select("*")
        .eq("channel", "whatsapp")
        .eq("status", "scheduled")
        .lte("scheduled_for", _utcnow().isoformat())
        .order("scheduled_for", desc=False)
        .limit(limit)
        .execute()
    )
    return res.data or []

def _user_phone_for(sb: Client, user_id: str) -> Optional[str]:
    # Usamos profiles.phone como “to”. Si no hay, no enviamos.
    p = sb.table("profiles").select("phone, notify_enabled").eq("id", user_id).limit(1).execute()
    if not p.data:
        return None
    row = p.data[0]
    if not row.get("notify_enabled", False):
        return None
    return row.get("phone")

def _build_task_template_params(snapshot: Dict[str, Any], tz_hint: str, header_hint: str) -> Dict[str, List[Dict[str, str]]]:
    title = snapshot.get("title") or "(no title)"
    start_ts = snapshot.get("start_ts")
    end_ts = snapshot.get("end_ts")
    tag = snapshot.get("tag") or "Other"
    status = snapshot.get("status") or "pending"
    desc = snapshot.get("description") or ""

    # Formateo “simple”; puedes adecuarlo a tu TZ
    def _fmt(dt: Optional[str]) -> str:
        if not dt:
            return ""
        try:
            return datetime.fromisoformat(dt.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
        except Exception:
            return str(dt)

    when_start = _fmt(start_ts)
    when_end = _fmt(end_ts)

    header = [{"type": "text", "text": header_hint}]
    body = [
        {"type": "text", "text": title},         # {{1}}
        {"type": "text", "text": when_start},    # {{2}}
        {"type": "text", "text": when_end},      # {{3}}
        {"type": "text", "text": tz_hint},       # {{4}}
        {"type": "text", "text": tag},           # {{5}}
        {"type": "text", "text": status},        # {{6}}
        {"type": "text", "text": desc},          # {{7}}
    ]
    return {"header": header, "body": body}

def _mark(sb: Client, notif_id: str, status: str, delivery: Optional[Dict[str, Any]] = None, error: Optional[str] = None):
    payload_delta = {}
    if delivery:
        payload_delta["last_delivery"] = delivery
    if error:
        payload_delta["last_error"] = error

    _ = (
        sb.table("notifications")
        .update({
            "status": status,
            "payload": payload_delta if payload_delta else None,
            "updated_at": "now()",
        })
        .eq("id", notif_id)
        .execute()
    )

def run_loop():
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        raise RuntimeError("Faltan META_WA_TOKEN/META_WA_PHONE_ID para enviar WhatsApp")
    sb = _sb()
    print(f"[dispatcher] running… poll={POLL_SECONDS}s")

    while True:
        try:
            due = _fetch_due_notifications(sb, limit=50)
            for n in due:
                notif_id = n["id"]
                user_id = n["user_id"]
                payload = n.get("payload") or {}

                to = _user_phone_for(sb, user_id)
                if not to:
                    _mark(sb, notif_id, "failed", error="User has no phone or notify_enabled=false")
                    continue

                mode = payload.get("mode")
                if mode != "template_by_task":
                    _mark(sb, notif_id, "failed", error=f"Unsupported mode: {mode}")
                    continue

                template_name = payload.get("template_name") or "rm_task_summary"
                lang_code = payload.get("lang_code") or "en"
                tz_hint = payload.get("tz_hint") or ""
                snap = payload.get("task_snapshot") or {}
                header_hint = payload.get("header_hint") or "15 min"  # por si lo incluyes en el payload

                params = _build_task_template_params(snap, tz_hint, header_hint)

                try:
                    delivery = send_template_positional(
                        to_e164=to,
                        template_name=template_name,
                        lang_code=lang_code,
                        header_params=params["header"],
                        body_params=params["body"],
                        button_params=None,  # añade si tu template requiere URL param
                    )
                    _mark(sb, notif_id, "sent", delivery=delivery)
                except WhatsAppError as we:
                    _mark(sb, notif_id, "failed", error=str(we))
        except Exception as e:
            print(f"[dispatcher] loop error: {e}")

        time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    run_loop()
