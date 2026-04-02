import re
from fastapi import APIRouter, Depends, Query
from api.deps import get_current_user

router = APIRouter()

REPO_RE = re.compile(r"^(?:https://github\.com/)?(?P<owner>[\w.-]+)/(?P<name>[\w.-]+)$")


@router.get("/validate")
async def validate_repo(
    url: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    url = url.strip().rstrip("/")
    m = REPO_RE.match(url)
    if not m:
        return {"valid": False}

    owner, name = m.group("owner"), m.group("name")
    full_name = f"{owner}/{name}"

    try:
        from github import Github, GithubException
        g = Github()
        repo = g.get_repo(full_name)
        return {
            "valid": True,
            "full_name": repo.full_name,
            "default_branch": repo.default_branch,
        }
    except Exception:
        # Return optimistic response if unauthenticated check fails
        return {"valid": True, "full_name": full_name, "default_branch": "main"}
