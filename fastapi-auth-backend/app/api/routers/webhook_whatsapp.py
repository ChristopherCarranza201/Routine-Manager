# app/api/routes/webhook_whatsapp.py
import os
from fastapi import APIRouter, Request, HTTPException

router = APIRouter(prefix="/webhooks/whatsapp", tags=["Webhooks - WhatsApp"])

VERIFY_TOKEN = os.getenv("META_WA_VERIFY_TOKEN", "")

@router.get("")
async def verify(request: Request):
    """
    Meta hace GET para verificar el webhook.
    Lee los parámetros con punto (hub.mode, hub.verify_token, hub.challenge) desde query_params.
    """
    if not VERIFY_TOKEN:
        raise HTTPException(status_code=500, detail="VERIFY_TOKEN not configured")

    params = request.query_params
    mode = params.get("hub.mode") or params.get("mode") or ""
    token = params.get("hub.verify_token") or params.get("verify_token") or ""
    challenge = params.get("hub.challenge") or params.get("challenge") or ""

    if mode == "subscribe" and token == VERIFY_TOKEN:
        # challenge puede ser número o texto
        try:
            return int(challenge)
        except Exception:
            return challenge
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("")
async def receive(request: Request):
    """
    Meta envía aquí los mensajes/eventos (entrantes, delivery status, etc.).
    Por ahora solo devolvemos 200 y el body para que puedas verlos en logs.
    Puedes extenderlo luego para guardar en DB o responder automáticamente.
    """
    try:
        body = await request.json()
    except Exception:
        body = {"error": "invalid json"}

    # TIP: agrega tus prints/logging aquí si quieres ver el payload.
    return {"received": True, "body": body}
