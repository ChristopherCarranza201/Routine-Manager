# app/core/whatsapp.py

import os
import httpx
from typing import Dict, Any, List, Optional

META_WA_TOKEN = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_ID = os.getenv("META_WA_PHONE_ID", "")

class WhatsAppError(Exception):
    pass

def _graph_url(path: str) -> str:
    # v19.0 estable; cambia si tu app usa otra versión
    return f"https://graph.facebook.com/v19.0/{path.lstrip('/')}"

def send_text(to_e164: str, body_text: str) -> Dict[str, Any]:
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        raise WhatsAppError("Faltan META_WA_TOKEN/META_WA_PHONE_ID en .env")

    payload = {
        "messaging_product": "whatsapp",
        "to": to_e164,
        "type": "text",
        "text": {"body": body_text},
    }
    headers = {"Authorization": f"Bearer {META_WA_TOKEN}"}

    with httpx.Client(timeout=30) as client:
        r = client.post(_graph_url(f"{META_WA_PHONE_ID}/messages"), json=payload, headers=headers)
        data = r.json()
        if r.status_code >= 300:
            raise WhatsAppError(f"WA error {r.status_code}: {data}")
        return data

def send_template_positional(
    to_e164: str,
    template_name: str,
    lang_code: str,
    header_params: Optional[List[Dict[str, str]]] = None,
    body_params: Optional[List[Dict[str, str]]] = None,
    button_params: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """
    Envia un template en modo POSITIONAL (como 'rm_task_summary').
    header_params/body_params/button_params son listas de objetos {"type":"text","text":"..."} en orden.
    """
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        raise WhatsAppError("Faltan META_WA_TOKEN/META_WA_PHONE_ID en .env")

    components = []
    if header_params:
        components.append({"type": "header", "parameters": header_params})
    if body_params:
        components.append({"type": "body", "parameters": body_params})
    if button_params:
        # Para QUICK_REPLY no se pasan parámetros; para URL parametrizable sí.
        components.append({"type": "button", "sub_type": "url", "index": "0", "parameters": button_params})

    payload = {
        "messaging_product": "whatsapp",
        "to": to_e164,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": lang_code},
            "components": components,
        },
    }
    headers = {"Authorization": f"Bearer {META_WA_TOKEN}"}

    with httpx.Client(timeout=30) as client:
        r = client.post(_graph_url(f"{META_WA_PHONE_ID}/messages"), json=payload, headers=headers)
        data = r.json()
        if r.status_code >= 300:
            raise WhatsAppError(f"WA error {r.status_code}: {data}")
        return data
