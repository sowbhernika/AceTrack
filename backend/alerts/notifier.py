"""
AceTrack - Notification service.

Sends error notifications via:
1. In-app notifications (stored in DB)
2. Telegram bot
"""

from __future__ import annotations

import logging

import httpx

from backend.config import settings
from backend.db.connection import SessionLocal
from backend.db.models import Notification

logger = logging.getLogger(__name__)


def notify_error(title: str, message: str, level: str = "error") -> None:
    """Create an in-app notification and send to Telegram."""
    # 1. Save to DB (in-app notification)
    try:
        db = SessionLocal()
        notif = Notification(title=title, message=message, level=level)
        db.add(notif)
        db.commit()
        db.close()
        logger.info("In-app notification created: %s", title)
    except Exception:
        logger.exception("Failed to save in-app notification")

    # 2. Send to Telegram
    if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
        try:
            _send_telegram(title, message, level)
        except Exception:
            logger.exception("Failed to send Telegram notification")


def _send_telegram(title: str, message: str, level: str) -> None:
    """Send a message to Telegram."""
    icon = {"error": "\u274c", "warning": "\u26a0\ufe0f", "info": "\u2139\ufe0f"}.get(level, "\u2757")

    text = f"{icon} *{title}*\n\n{message}"

    # Use direct IP since api.telegram.org is blocked by network firewall
    url = f"https://149.154.166.110/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": settings.TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
    }

    with httpx.Client(timeout=10.0, verify=False) as client:
        resp = client.post(url, json=payload, headers={"Host": "api.telegram.org"})
        if resp.status_code == 200:
            logger.info("Telegram notification sent: %s", title)
        else:
            logger.warning("Telegram API returned %s: %s", resp.status_code, resp.text[:200])
