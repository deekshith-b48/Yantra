import hmac
import hashlib
import os
from fastapi import APIRouter, Request, HTTPException

router = APIRouter()


@router.post("/github")
async def github_webhook(request: Request):
    """Handle GitHub webhook events (PR status updates, etc.)."""
    secret = os.getenv("GITHUB_WEBHOOK_SECRET", "")
    if secret:
        sig_header = request.headers.get("X-Hub-Signature-256", "")
        body = await request.body()
        expected = "sha256=" + hmac.new(
            secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig_header, expected):
            raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event = request.headers.get("X-GitHub-Event", "")

    # Future: handle PR merge events to update run status
    return {"received": True, "event": event}
