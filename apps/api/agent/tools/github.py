import os
import re
from github import Github, GithubException
from agent.tools.crypto import decrypt_token


def get_github_client(encrypted_token: str) -> Github:
    token = decrypt_token(encrypted_token)
    return Github(token)


def parse_repo_url(url: str) -> tuple[str, str]:
    """Return (owner, repo) from a GitHub URL or owner/repo string."""
    url = url.strip().rstrip("/")
    match = re.match(r"(?:https?://github\.com/)?([^/]+)/([^/]+?)(?:\.git)?$", url)
    if not match:
        raise ValueError(f"Invalid GitHub repo URL or slug: {url}")
    return match.group(1), match.group(2)


def fetch_issue_body(repo_full_name: str, issue_number: int, token: str) -> str:
    g = Github(token)
    repo = g.get_repo(repo_full_name)
    issue = repo.get_issue(issue_number)
    return f"Title: {issue.title}\n\n{issue.body or ''}"


def validate_token_scopes(token: str) -> bool:
    """Validate that the token has the 'repo' scope."""
    g = Github(token)
    try:
        user = g.get_user()
        _ = user.login  # triggers API call
        return True
    except GithubException:
        return False


def create_pull_request(
    repo_full_name: str,
    token: str,
    branch_name: str,
    title: str,
    body: str,
    base: str = "main",
) -> tuple[str, int]:
    """Create a PR and return (pr_url, pr_number)."""
    g = Github(token)
    repo = g.get_repo(repo_full_name)
    pr = repo.create_pull(title=title, body=body, head=branch_name, base=base)
    return pr.html_url, pr.number
