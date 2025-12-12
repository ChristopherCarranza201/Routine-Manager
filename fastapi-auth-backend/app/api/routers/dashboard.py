from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone
from app.core.auth import get_user_id
from app.core.supabase_client import get_supabase_for_request, get_service_supabase

router = APIRouter(prefix="/dashboard", tags=["Dashboard Summary"])

@router.get("/summary")
def dashboard_summary(
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request)
):
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)

    prof_resp = (sb.table("profiles").select("*").eq("id", user_id).limit(1).execute())
    prof_rows = prof_resp.data or []
    profile = prof_rows[0] if prof_rows else None

    if profile is None:
        # fallback solo para DEV: intenta autoinsert con service role
        try:
            ssvc = get_service_supabase()
            ssvc.table("profiles").insert({"id": user_id}).execute()
            # vuelve a leer con el cliente del request (si hay JWT, pasará RLS; si no, seguirá null y no rompe)
            prof_resp2 = (sb.table("profiles").select("*").eq("id", user_id).limit(1).execute())
            prof_rows2 = prof_resp2.data or []
            profile = prof_rows2[0] if prof_rows2 else None
        except Exception:
            profile = None

    upcoming = (sb.table("tasks").select("*")
                .eq("user_id", user_id)
                .gte("start_ts", now.isoformat())
                .lte("start_ts", soon.isoformat())
                .order("start_ts", desc=False)
                .limit(10).execute()).data or []

    recent_chat = (sb.table("chat_messages").select("*")
                   .eq("user_id", user_id)
                   .order("created_at", desc=True)
                   .limit(10).execute()).data or []

    return {"profile": profile, "upcoming": upcoming, "recent_chat": recent_chat}
