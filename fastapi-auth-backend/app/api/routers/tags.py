# app/api/routers/tags.py
from typing import List, Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.db import get_supabase
from app.schemas.tags import TagCreate, TagOut

# auth para user_id
from app.core.auth import get_current_user
from app.api.models.user import UserOut

router = APIRouter(prefix="/tags", tags=["Tags"])

def _exec_or_400(res, fallback_msg="Operation failed"):
    data = getattr(res, "data", None)
    if data is None or (isinstance(data, list) and len(data) == 0):
        err = getattr(res, "error", None)
        if not err:
            resp = getattr(res, "response", None)
            if resp is not None:
                try:
                    err = resp.json()
                except Exception:
                    err = getattr(resp, "text", None) or fallback_msg
        raise HTTPException(status_code=400, detail=err or fallback_msg)
    return data

@router.get("", response_model=List[TagOut])
def list_tags(supa = Depends(get_supabase), q: str = Query("", description="Filter by name")):
    query = supa.table("tags").select("*").order("name")
    if q:
        query = query.ilike("name", f"%{q}%")
    res = query.execute()
    return getattr(res, "data", []) or []

@router.post("", response_model=TagOut, status_code=201)
def create_tag(
    body: TagCreate,
    supa = Depends(get_supabase),
    current_user: Annotated[UserOut, Depends(get_current_user)] = None
):
    # Debemos enviar user_id porque la columna es NOT NULL y RLS lo exige
    payload = {"user_id": current_user.id, **body.model_dump()}
    ins = supa.table("tags").insert(payload).execute()
    data = _exec_or_400(ins, "Cannot create tag")
    if isinstance(data, list) and len(data) > 0:
        return data[0]
    # fallback select
    sel = (
        supa.table("tags")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("name", body.name)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return _exec_or_400(sel, "Tag created but not found")[0]

@router.post("/assign", status_code=204)
def assign_tag(task_id: UUID, tag_id: UUID, supa = Depends(get_supabase)):
    res = supa.table("task_tags").insert({"task_id": str(task_id), "tag_id": str(tag_id)}).execute()
    _exec_or_400(res, "Cannot assign tag")
    return

@router.post("/unassign", status_code=204)
def unassign_tag(task_id: UUID, tag_id: UUID, supa = Depends(get_supabase)):
    res = supa.table("task_tags").delete().match({"task_id": str(task_id), "tag_id": str(tag_id)}).execute()
    _exec_or_400(res, "Cannot unassign tag")
    return

@router.get("/by-task/{task_id}", response_model=List[TagOut])
def tags_by_task(task_id: UUID, supa=Depends(get_supabase)):
    # join manual: primero task_tags, luego tags
    rel = supa.table("task_tags").select("tag_id").eq("task_id", str(task_id)).execute()
    tag_ids = [r["tag_id"] for r in (rel.data or [])]
    if not tag_ids:
        return []
    res = supa.table("tags").select("*").in_("id", tag_ids).order("name").execute()
    return res.data or []
