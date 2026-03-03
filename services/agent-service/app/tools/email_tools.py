from __future__ import annotations
import imaplib
import smtplib
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import decode_header
from email.utils import parseaddr
import structlog
from typing import Any
from datetime import datetime

from app.config import settings
from app import db

log = structlog.get_logger(service="agent-service", module="tools.email")


def _decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    decoded_parts = decode_header(value)
    result = []
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(part)
    return " ".join(result)


def _extract_text_body(msg: email.message.Message) -> tuple[str, str]:
    """Extract plain text and HTML body from email message."""
    text_body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))
            if "attachment" in content_disposition:
                continue
            try:
                payload = part.get_payload(decode=True)
                if payload is None:
                    continue
                charset = part.get_content_charset() or "utf-8"
                decoded = payload.decode(charset, errors="replace")
                if content_type == "text/plain":
                    text_body += decoded
                elif content_type == "text/html":
                    html_body += decoded
            except Exception:
                continue
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            if msg.get_content_type() == "text/html":
                html_body = decoded
            else:
                text_body = decoded

    return text_body, html_body


class EmailTools:
    """IMAP email fetching and SMTP auto-reply for SupportAgent."""

    def __init__(self, store_id: str):
        self.store_id = store_id

    def is_configured(self) -> bool:
        return bool(settings.IMAP_HOST and settings.IMAP_USER and settings.IMAP_PASSWORD)

    def is_smtp_configured(self) -> bool:
        return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)

    async def fetch_new_emails(self, max_emails: int = 50) -> list[dict[str, Any]]:
        """Fetch unread emails from IMAP and store them in email_inbox table."""
        if not self.is_configured():
            log.warning("imap_not_configured")
            return []

        log.info("fetching_emails", host=settings.IMAP_HOST, folder=settings.IMAP_FOLDER)
        fetched: list[dict[str, Any]] = []

        try:
            if settings.IMAP_USE_SSL:
                mail = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
            else:
                mail = imaplib.IMAP4(settings.IMAP_HOST, settings.IMAP_PORT)

            mail.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
            mail.select(settings.IMAP_FOLDER)

            # Search for unseen emails
            status, messages = mail.search(None, "UNSEEN")
            if status != "OK":
                log.warning("imap_search_failed", status=status)
                mail.logout()
                return []

            email_ids = messages[0].split()
            if not email_ids:
                log.info("no_new_emails")
                mail.logout()
                return []

            # Limit
            email_ids = email_ids[-max_emails:]

            for eid in email_ids:
                try:
                    status, msg_data = mail.fetch(eid, "(RFC822)")
                    if status != "OK" or not msg_data or not msg_data[0]:
                        continue

                    raw_email = msg_data[0][1]
                    if isinstance(raw_email, tuple):
                        raw_email = raw_email[1] if len(raw_email) > 1 else raw_email[0]
                    msg = email.message_from_bytes(raw_email)

                    message_id = msg.get("Message-ID", "")
                    from_addr = parseaddr(msg.get("From", ""))[1]
                    to_addr = parseaddr(msg.get("To", ""))[1]
                    subject = _decode_header_value(msg.get("Subject"))
                    date_str = msg.get("Date", "")
                    text_body, html_body = _extract_text_body(msg)

                    # Dedup check
                    existing = await db.fetch_one(
                        "SELECT id FROM email_inbox WHERE message_id = $1",
                        message_id,
                    )
                    if existing:
                        continue

                    # Store in DB
                    row = await db.fetch_one(
                        """
                        INSERT INTO email_inbox
                            (store_id, message_id, from_address, to_address, subject, body_text, body_html, received_at, status)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'new')
                        RETURNING id
                        """,
                        self.store_id, message_id, from_addr, to_addr, subject,
                        text_body[:50000], html_body[:50000],
                    )

                    email_record = {
                        "id": str(row["id"]),
                        "message_id": message_id,
                        "from_address": from_addr,
                        "to_address": to_addr,
                        "subject": subject,
                        "body_text": text_body[:2000],
                        "received_at": date_str,
                    }
                    fetched.append(email_record)
                    log.info("email_fetched", from_addr=from_addr, subject=subject[:80])

                except Exception as e:
                    log.error("email_fetch_error", error=str(e), email_id=str(eid))
                    continue

            mail.logout()
            log.info("emails_fetched", count=len(fetched))

        except Exception as e:
            log.error("imap_connection_error", error=str(e))

        return fetched

    async def get_pending_emails(self, limit: int = 50) -> list[dict]:
        """Get emails from DB that haven't been processed yet."""
        rows = await db.fetch_all(
            """
            SELECT id, message_id, from_address, to_address, subject, body_text, received_at, status, classification
            FROM email_inbox
            WHERE store_id = $1 AND status IN ('new', 'processing')
            ORDER BY created_at DESC
            LIMIT $2
            """,
            self.store_id, limit,
        )
        for row in rows:
            row["id"] = str(row["id"])
            row["received_at"] = row["received_at"].isoformat() if row.get("received_at") else None
        return rows

    async def update_email_classification(
        self,
        email_id: str,
        is_customer: bool,
        classification: str,
        suggested_response: str | None = None,
        agent_run_id: str | None = None,
    ) -> None:
        """Update email with classification and suggested response."""
        log.info(
            "email_classified",
            email_id=email_id,
            is_customer=is_customer,
            classification=classification,
        )
        await db.execute(
            """
            UPDATE email_inbox
            SET is_customer = $1, classification = $2, suggested_response = $3,
                agent_run_id = $4, status = 'processing'
            WHERE id = $5::uuid
            """,
            is_customer, classification, suggested_response, agent_run_id, email_id,
        )

    async def send_auto_reply(self, email_id: str, custom_message: str | None = None) -> bool:
        """Send auto-reply acknowledging receipt of customer email."""
        if not self.is_smtp_configured():
            log.warning("smtp_not_configured")
            return False

        row = await db.fetch_one(
            "SELECT from_address, subject, is_customer FROM email_inbox WHERE id = $1::uuid",
            email_id,
        )
        if not row:
            log.warning("email_not_found", email_id=email_id)
            return False

        if not row["is_customer"]:
            log.info("skip_auto_reply_not_customer", email_id=email_id)
            return False

        to_addr = row["from_address"]
        original_subject = row["subject"] or ""

        reply_subject = f"Re: {original_subject}" if not original_subject.startswith("Re:") else original_subject
        reply_body = custom_message or (
            "Hola,\n\n"
            "Hemos recibido tu mensaje y nuestro equipo lo está revisando.\n"
            "Te responderemos lo antes posible.\n\n"
            "Gracias por tu paciencia.\n\n"
            f"— {settings.SMTP_FROM_NAME}"
        )

        try:
            msg = MIMEMultipart()
            msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_ADDRESS or settings.SMTP_USER}>"
            msg["To"] = to_addr
            msg["Subject"] = reply_subject
            msg.attach(MIMEText(reply_body, "plain", "utf-8"))

            if settings.SMTP_USE_TLS:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
                server.starttls()
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)

            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
            server.quit()

            await db.execute(
                "UPDATE email_inbox SET auto_reply_sent = true WHERE id = $1::uuid",
                email_id,
            )

            log.info("auto_reply_sent", email_id=email_id, to=to_addr)
            return True

        except Exception as e:
            log.error("auto_reply_failed", email_id=email_id, error=str(e))
            return False

    async def mark_email_responded(self, email_id: str) -> None:
        await db.execute(
            "UPDATE email_inbox SET status = 'responded' WHERE id = $1::uuid",
            email_id,
        )
