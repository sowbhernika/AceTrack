"""
Acetech Escalation System - WhatsApp Message Sender.

Sends WhatsApp messages via the WaSender API using an async HTTP client.
"""

from __future__ import annotations

import logging

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)


async def send_whatsapp(phone: str, message: str) -> dict:
    """Send a WhatsApp message to *phone* via the WaSender API.

    Parameters
    ----------
    phone:
        Mobile number.  ``+91`` is prepended automatically when missing.
    message:
        The text body to send.

    Returns
    -------
    dict
        ``{"status": "success", "response": <api_json>}`` on success, or
        ``{"status": "failed", "error": "<description>"}`` on failure.
    """
    # Normalise phone number ---------------------------------------------------
    phone = phone.strip()
    if not phone.startswith("+91"):
        phone = f"+91{phone.lstrip('+')}"

    headers = {
        "Authorization": f"Bearer {settings.WASENDER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": phone,
        "text": message,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                settings.WASENDER_URL,
                json=payload,
                headers=headers,
            )

        if response.status_code in (200, 201):
            logger.info(
                "WhatsApp message sent successfully to %s (HTTP %s)",
                phone,
                response.status_code,
            )
            return {"status": "success", "response": response.json()}

        logger.warning(
            "WaSender API returned HTTP %s for %s: %s",
            response.status_code,
            phone,
            response.text[:500],
        )
        return {
            "status": "failed",
            "error": f"HTTP {response.status_code}: {response.text[:500]}",
        }

    except httpx.TimeoutException:
        logger.error("Timeout sending WhatsApp message to %s", phone)
        return {"status": "failed", "error": "Request timed out"}

    except httpx.RequestError as exc:
        logger.error(
            "Network error sending WhatsApp message to %s: %s", phone, exc
        )
        return {"status": "failed", "error": f"Network error: {exc}"}

    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "Unexpected error sending WhatsApp message to %s", phone
        )
        return {"status": "failed", "error": f"Unexpected error: {exc}"}
