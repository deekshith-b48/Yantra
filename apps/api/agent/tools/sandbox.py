import asyncio
import os
import docker
from docker.errors import DockerException

TIMEOUT_SECONDS = 120
MAX_MEMORY = "512m"


def _detect_test_command(repo_path: str) -> tuple[str, str]:
    """Return (image, test_command) based on repo contents."""
    import json

    pkg_json = os.path.join(repo_path, "package.json")
    pytest_ini = os.path.join(repo_path, "pytest.ini")
    pyproject = os.path.join(repo_path, "pyproject.toml")

    if os.path.exists(pkg_json):
        with open(pkg_json) as f:
            pkg = json.load(f)
        scripts = pkg.get("scripts", {})
        test_cmd = scripts.get("test", "npm test")
        return "node:20-alpine", f"npm ci --silent && {test_cmd}"

    if os.path.exists(pytest_ini) or os.path.exists(pyproject):
        return "python:3.12-slim", "pip install -e . -q && pytest -v"

    # Default fallback
    return "node:20-alpine", "npm ci --silent && npm test"


async def run_tests(
    run_id: str,
    repo_path: str,
    emit_log,
) -> tuple[bool, str]:
    """
    Run the test suite inside an isolated Docker container.
    Returns (passed: bool, output: str).
    """
    client = docker.from_env()
    image, cmd = _detect_test_command(repo_path)

    # Pull image if needed
    try:
        client.images.get(image)
    except docker.errors.ImageNotFound:
        await emit_log(f"Pulling Docker image {image}...")
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: client.images.pull(image)
        )

    container = None
    output_lines = []
    passed = False

    try:
        container = client.containers.run(
            image=image,
            command=["sh", "-c", cmd],
            volumes={repo_path: {"bind": "/app", "mode": "rw"}},
            working_dir="/app",
            network_mode="none",
            read_only=False,
            cap_drop=["ALL"],
            mem_limit=MAX_MEMORY,
            detach=True,
            remove=False,
        )

        # Stream logs with timeout
        deadline = asyncio.get_event_loop().time() + TIMEOUT_SECONDS
        for log_line in container.logs(stream=True, follow=True):
            if asyncio.get_event_loop().time() > deadline:
                container.kill()
                await emit_log("Tests timed out after 120s")
                break
            line = log_line.decode("utf-8", errors="replace").rstrip()
            output_lines.append(line)
            await emit_log(line)

        result = container.wait(timeout=5)
        exit_code = result.get("StatusCode", 1)
        passed = exit_code == 0

    except DockerException as e:
        await emit_log(f"Docker error: {e}")
    finally:
        if container:
            try:
                container.remove(force=True)
            except Exception:
                pass

    return passed, "\n".join(output_lines)
