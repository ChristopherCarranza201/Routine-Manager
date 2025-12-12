from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict
from app.core.auth import get_user_id
from app.core.openai_client import get_openai
from app.core.supabase_client import get_supabase_for_request
from app.schemas.chat import ChatMessage
import json


router = APIRouter(prefix="/chat", tags=["ChatBot - Message"])

TOOLS = [
  {
    "type": "function",
    "function": {
      "name": "create_task",
      "description": "Create a task from natural language.",
      "parameters": {
        "type":"object",
        "properties":{
          "title":{"type":"string"},
          "description":{"type":["string","null"]},
          "tag":{"type":"string","enum":["Education","Workout","Home","Job","Other"]},
          "start_ts":{"type":"string","description":"ISO timestamp"},
          "end_ts":{"type":["string","null"],"description":"ISO timestamp"},
          "status":{"type":"string","enum":["pending","in_progress","done","canceled"]}
        },
        "required":["title","start_ts"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "update_task",
      "parameters": {
        "type":"object",
        "properties":{
          "id":{"type":"string"},
          "title":{"type":"string"},
          "description":{"type":"string"},
          "tag":{"type":"string"},
          "start_ts":{"type":"string"},
          "end_ts":{"type":"string"},
          "status":{"type":"string","enum":["pending","in_progress","done","canceled"]}
        },
        "required":["id"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name":"delete_task",
      "parameters":{"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}
    }
  },
  {
    "type": "function",
    "function": {
      "name":"bulk_repeat",
      "description":"Duplicate one task into a recurrent plan for N months; optional weekdays selection.",
      "parameters":{
        "type":"object",
        "properties":{
          "id":{"type":"string"},
          "months":{"type":"integer"},
          "weekdays":{"type":"array","items":{"type":"integer","minimum":0,"maximum":6}}
        },
        "required":["id","months"]
      }
    }
  }
]

SYSTEM = (
  "Eres un asistente para un Routine Manager. Extrae fecha/hora, etiqueta y título. "
  "Si falta info, haz UNA pregunta concreta. Cuando la intención sea clara, llama la herramienta adecuada."
)

# ---------------------------
# Helpers
# ---------------------------
def _iso_dt(value):
    """Acepta datetime/date/str → ISO8601 str o None."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, str):
        return value
    raise ValueError(f"Unsupported datetime/date value: {value!r}")

def _clean_dict(d: dict):
    """Elimina claves con valor None."""
    return {k: v for k, v in d.items() if v is not None}

def _parse_tool_args(raw) -> Dict[str, Any]:
    """Parsea arguments de tool: puede venir como str (JSON) o dict."""
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}

# ==================================================================
# FIXED: Supabase v2 compatibility (no .select() after insert/update)
# y validaciones amables para no romper por datos faltantes
# ==================================================================
def _call_tool(tool_name: str, args: Dict[str, Any], user_id: str, sb):
    try:
        action = (tool_name or "").strip().lower()

        # ----------------------------------------------------------
        # CREATE TASK
        # ----------------------------------------------------------
        if action == "create_task":
            title = args.get("title")
            start_ts = args.get("start_ts")

            # Validación amable: pide datos si faltan
            if not title and not start_ts:
                return {
                    "ok": False,
                    "ask": True,
                    "message": "¿Cuál es el título y la fecha/hora de inicio (ISO) de la tarea?"
                }
            if not title:
                return {"ok": False, "ask": True, "message": "Me falta el título de la tarea. ¿Cuál sería?"}
            if not start_ts:
                return {"ok": False, "ask": True, "message": f"¿Qué fecha/hora (ISO) para “{title}”? Ej: 2025-10-22T07:00:00Z"}

            data = {
                "user_id": user_id,
                "title": title,
                "description": args.get("description"),
                "tag": args.get("tag"),
                "start_ts": _iso_dt(start_ts),
                "end_ts": _iso_dt(args.get("end_ts")),
                "status": args.get("status") or "pending",
            }
            data = _clean_dict(data)

            # insert v2
            ins = sb.table("tasks").insert(data).execute()
            if getattr(ins, "data", None):
                task = ins.data[0]
            else:
                # SELECT separado (por si el backend no devolviera representación)
                fetch = (
                    sb.table("tasks")
                    .select("*")
                    .eq("user_id", user_id)
                    .eq("title", title)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if not fetch.data:
                    return {"ok": False, "message": "No pude confirmar la inserción (sin data)."}
                task = fetch.data[0]
            return {"ok": True, "task": task}

        # ----------------------------------------------------------
        # UPDATE TASK
        # ----------------------------------------------------------
        if action == "update_task":
            tid = args.get("id")
            if not tid:
                return {"ok": False, "ask": True, "message": "Necesito el id de la tarea a actualizar."}

            updates = {}
            for k in ["title", "description", "tag", "status"]:
                if k in args:
                    updates[k] = args[k]
            if "start_ts" in args:
                updates["start_ts"] = _iso_dt(args["start_ts"])
            if "end_ts" in args:
                updates["end_ts"] = _iso_dt(args["end_ts"])
            updates = _clean_dict(updates)

            if not updates:
                return {"ok": False, "ask": True, "message": "¿Qué campo deseas actualizar? (title/description/tag/status/start_ts/end_ts)"}

            # update v2
            sb.table("tasks").update(updates).eq("id", tid).eq("user_id", user_id).execute()

            # SELECT separado
            fetch = (
                sb.table("tasks")
                .select("*")
                .eq("id", tid)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            if not fetch.data:
                return {"ok": False, "message": "No encontré la tarea luego de actualizar."}
            return {"ok": True, "task": fetch.data[0]}

        # ----------------------------------------------------------
        # DELETE TASK
        # ----------------------------------------------------------
        if action == "delete_task":
            tid = args.get("id")
            if not tid:
                return {"ok": False, "ask": True, "message": "Necesito el id de la tarea a eliminar."}
            sb.table("tasks").delete().eq("id", tid).eq("user_id", user_id).execute()
            return {"ok": True, "deleted_id": tid}

        # ----------------------------------------------------------
        # BULK REPEAT (placeholder)
        # ----------------------------------------------------------
        if action == "bulk_repeat":
            # TODO: Implementar duplicación real (según months/weekdays)
            return {"ok": True, "created": 0}

        return {"ok": False, "message": f"Acción no reconocida: {tool_name}"}

    except Exception as e:
        # Captura limpia para no romper el flujo del chat
        return {"ok": False, "message": f"[chat._call_tool] {e}"}

# ==================================================================
# Endpoint principal
# ==================================================================
@router.post("/message")
def chat_message(
    payload: ChatMessage,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request)
):
    client = get_openai()

    # Guarda mensaje de usuario (content.message)
    sb.table("chat_messages").insert({
        "user_id": user_id, "role": "user", "content": {"message": payload.message}
    }).execute()

    # Pide decisión al modelo
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": payload.message}
        ],
        tools=TOOLS,
        tool_choice="auto",
        temperature=0.2
    )

    msg = resp.choices[0].message

    # Si hay llamada a herramienta
    if getattr(msg, "tool_calls", None):
        tool = msg.tool_calls[0]
        args = _parse_tool_args(tool.function.arguments)
        result = _call_tool(tool.function.name, args, user_id, sb)

        # Guarda rastro de tool
        sb.table("chat_messages").insert({
            "user_id": user_id,
            "role": "tool",
            "content": {"tool": tool.function.name, "args": args, "result": result}
        }).execute()

        # Respuesta del assistant según resultado
        if result.get("ok"):
            text = "He creado tu tarea." if tool.function.name == "create_task" else "He actualizado tus tareas."
        else:
            # Si el tool pide aclaración, muestra el mensaje de ask
            text = result.get("message") or "Necesito un dato adicional para continuar."

        sb.table("chat_messages").insert({
            "user_id": user_id, "role": "assistant", "content": {"message": text}
        }).execute()

        if not result.get("ok") and not result.get("ask"):
            # error real (no es una simple aclaración)
            raise HTTPException(status_code=400, detail=text)

        return {"reply": text, "tool_result": result}

    # Sin tool calls → pregunta aclaratoria genérica
    assistant_text = "¿Podrías indicar título y fecha/hora (ISO) para la tarea?"
    sb.table("chat_messages").insert({
        "user_id": user_id, "role": "assistant", "content": {"message": assistant_text}
    }).execute()
    return {"reply": assistant_text}
