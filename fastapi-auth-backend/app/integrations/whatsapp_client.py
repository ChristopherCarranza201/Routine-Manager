# app/integrations/whatsapp_client.py
import os
import requests
from typing import Optional, Dict, Any

META_WA_TOKEN = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_ID = os.getenv("META_WA_PHONE_ID", "")
GRAPH_BASE = "https://graph.facebook.com/v19.0"

if not META_WA_TOKEN or not META_WA_PHONE_ID:
    # No lanzamos excepción al importar para no romper tu app en local.
    # Las funciones retornarán error explícito si faltan.
    pass

def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {META_WA_TOKEN}",
        "Content-Type": "application/json"
    }

def send_text(to_msisdn: str, message: str) -> Dict[str, Any]:
    """
    Envía un mensaje de texto simple por WhatsApp Cloud API.
    - to_msisdn en formato internacional (e.g., '5215551234567')
    """
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        return {"ok": False, "error": "META_WA_TOKEN or META_WA_PHONE_ID missing"}

    url = f"{GRAPH_BASE}/{META_WA_PHONE_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_msisdn,
        "type": "text",
        "text": {"body": message},
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=20)
    try:
        data = resp.json()
    except Exception:
        data = {"error": "Invalid JSON response", "status_code": resp.status_code, "text": resp.text}
    ok = (200 <= resp.status_code < 300) and ("messages" in data or "messages" in str(data))
    return {"ok": ok, "status_code": resp.status_code, "data": data}

def send_template(to_msisdn: str, template_name: str, lang_code: str = "es_MX", components: Optional[list] = None) -> Dict[str, Any]:
    """
    Envía un mensaje basado en plantilla (debes tenerla aprobada en Meta).
    components: lista con parámetros (header/body/button) según formato de Cloud API.
    """
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        return {"ok": False, "error": "META_WA_TOKEN or META_WA_PHONE_ID missing"}

    url = f"{GRAPH_BASE}/{META_WA_PHONE_ID}/messages"
    template = {
        "name": template_name,
        "language": {"code": lang_code},
    }
    if components:
        template["components"] = components

    payload = {
        "messaging_product": "whatsapp",
        "to": to_msisdn,
        "type": "template",
        "template": template,
    }
    resp = requests.post(url, headers=_headers(), json=payload, timeout=20)
    try:
        data = resp.json()
    except Exception:
        data = {"error": "Invalid JSON response", "status_code": resp.status_code, "text": resp.text}
    ok = (200 <= resp.status_code < 300) and ("messages" in data or "messages" in str(data))
    return {"ok": ok, "status_code": resp.status_code, "data": data}
