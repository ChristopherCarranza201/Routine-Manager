# app/worker/reminder_loop.py
import os, time
from datetime import datetime, timezone, timedelta

# 1) Cargar .env si existe (útil en VSCode / procesos que no heredan entorno)
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

from supabase import create_client
from app.core.whatsapp import send_template_positional, WhatsAppError  # tu wrapper que ya usas

# Estos sí pueden quedarse cacheados
POLL = int(os.getenv("DISPATCHER_POLL_SECONDS", "30"))
BATCH_SIZE = int(os.getenv("DISPATCHER_BATCH_SIZE", "20"))
MAX_ATTEMPTS = int(os.getenv("DISPATCHER_MAX_ATTEMPTS", "5"))

def _sb():
    """
    Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY SIEMPRE del entorno
    cuando se crea el cliente, para evitar problemas de 'cacheo' en import.
    """
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""

    if not url or not key:
        # Mensaje de diagnóstico amable
        msg = [
            "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno",
            f"SUPABASE_URL: {'<vacío>' if not url else url}",
            f"SUPABASE_SERVICE_ROLE_KEY: {'<vacío>' if not key else '<presente>'}",
            "Sugerencias:",
            "- Si estás en PowerShell, exporta antes de ejecutar: ",
            "    $env:SUPABASE_URL = 'https://<TU-PROYECTO>.supabase.co'",
            "    $env:SUPABASE_SERVICE_ROLE_KEY = '<service-role>'",
            "    python -m app.worker.reminder_loop",
            "- O crea un .env en la raíz con esas claves y deja este archivo cargarlo automáticamente.",
        ]
        raise RuntimeError("\n".join(msg))

    return create_client(url, key)

def _fmt(ts):
    if not ts:
        return ""
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(ts)

def _user_phone(sb, user_id):
    r = (sb.table("profiles").select("phone, notify_enabled").eq("id", user_id).limit(1).execute()).data
    if not r:
        return None
    row = r[0]
    if not row.get("notify_enabled"):
        return None
    return row.get("phone")

def _fallback_due(sb):
    """Modo sin RPC: busca vencidas y no en procesamiento; el worker marcará processing=True."""
    now_iso = datetime.now(timezone.utc).isoformat()
    return (
        sb.table("notifications")
          .select("*")
          .eq("channel", "whatsapp")
          .eq("status", "scheduled")
          .or_(f"and(next_retry_at.is.null,scheduled_for.lte.{now_iso}),and(next_retry_at.lte.{now_iso})")
          .eq("processing", False)
          .order("scheduled_for", desc=False)
          .limit(BATCH_SIZE)
          .execute()
    ).data or []

def _claim_batch(sb):
    """Intenta usar el RPC claim_notifications; si falla (no existe), usa fallback y marca processing aquí."""
    try:
        res = sb.rpc("claim_notifications", {"p_limit": BATCH_SIZE}).execute()
        return res.data or [], True
    except Exception:
        rows = _fallback_due(sb)
        ids = [r["id"] for r in rows]
        if ids:
            sb.table("notifications").update({
                "processing": True,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).in_("id", ids).execute()
        return rows, False

def _backoff_delay(attempts: int) -> int:
    """Exponential backoff simple (minutos)."""
    table = [1, 5, 15, 60, 120, 240]
    idx = min(max(attempts, 0), len(table)-1)
    return table[idx]

def _send_one(sb, n: dict):
    uid = n["user_id"]
    phone = _user_phone(sb, uid)
    if not phone:
        raise WhatsAppError("No phone or notifications disabled for user.")
    p = n.get("payload") or {}
    snap = p.get("task_snapshot") or {}

    header = [{"type": "text", "text": p.get("header_hint") or "15 min"}]
    body = [
        {"type": "text", "text": snap.get("title") or "(no title)"},
        {"type": "text", "text": _fmt(snap.get("start_ts"))},
        {"type": "text", "text": _fmt(snap.get("end_ts"))},
        {"type": "text", "text": p.get("tz_hint") or ""},
        {"type": "text", "text": snap.get("tag") or "Other"},
        {"type": "text", "text": snap.get("status") or "pending"},
        {"type": "text", "text": snap.get("description") or ""},
    ]

    return send_template_positional(
        to_e164=phone,
        template_name=p.get("template_name") or "rm_task_summary",
        lang_code=p.get("lang_code") or "en",
        header_params=header,
        body_params=body,
        button_params=None  # si luego activas botón, pásalo aquí
    )

def run():
    sb = _sb()
    print(f"[dispatcher] running; poll={POLL}s batch={BATCH_SIZE} max_attempts={MAX_ATTEMPTS}")
    while True:
        batch, via_rpc = _claim_batch(sb)
        if not batch:
            time.sleep(POLL)
            continue

        for n in batch:
            nid = n["id"]
            attempts = int(n.get("attempts") or 0)
            try:
                delivery = _send_one(sb, n)
                sb.table("notifications").update({
                    "status": "sent",
                    "processing": False,
                    "attempts": attempts + 1,
                    "payload": {**(n.get("payload") or {}), "last_delivery": delivery},
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", nid).execute()

            except WhatsAppError as e:
                attempts += 1
                if attempts >= MAX_ATTEMPTS:
                    sb.table("notifications").update({
                        "status": "failed",
                        "processing": False,
                        "attempts": attempts,
                        "payload": {**(n.get("payload") or {}), "last_error": str(e)},
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).eq("id", nid).execute()
                else:
                    delay_min = _backoff_delay(attempts)
                    sb.table("notifications").update({
                        "status": "scheduled",
                        "processing": False,
                        "attempts": attempts,
                        "next_retry_at": (datetime.now(timezone.utc) + timedelta(minutes=delay_min)).isoformat(),
                        "payload": {**(n.get("payload") or {}), "last_error": str(e)},
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).eq("id", nid).execute()
            except Exception as e:
                # Falla inesperada: liberar processing y reintentar luego
                sb.table("notifications").update({
                    "status": "scheduled",
                    "processing": False,
                    "payload": {**(n.get("payload") or {}), "last_error": f"unexpected: {e}"},
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", nid).execute()

        time.sleep(1)

if __name__ == "__main__":
    run()
