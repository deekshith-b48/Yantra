from agent.state import AgentState
from agent.tools.sandbox import run_tests
from agent.tools import llm


async def run(state: AgentState) -> AgentState:
    run_id = state["run_id"]
    current_files = state.get("current_files", {})
    retry_count = state.get("retry_count", 0)
    log_events = []

    async def emit(msg: str):
        log_events.append(msg)

    repo_path = f"/tmp/{run_id}"

    await emit("Running tests in isolated Docker sandbox...")
    passed, output = await run_tests(run_id, repo_path, emit)

    if passed:
        await emit("All tests passed!")
    else:
        retry_count += 1
        await emit(f"Tests failed (attempt {retry_count}/3).")

        if retry_count < 3 and current_files:
            # Give Claude the error output and ask for a fix
            first_file = next(iter(current_files))
            file_content = current_files[first_file]
            fix_prompt = f"""The test suite failed. Here is the output:

{output[-3000:]}

Here is the file that most likely caused the failure ({first_file}):

{file_content[:6000]}

Rewrite {first_file} to fix the failing tests. Return ONLY the complete file content."""

            fixed_content = await llm.complete(
                fix_prompt,
                system="You are an expert software engineer. Return only the complete fixed file content, no explanation.",
                model="claude-sonnet-4-5",
                max_tokens=8192,
            )

            import os
            full_path = os.path.join(repo_path, first_file)
            with open(full_path, "w", encoding="utf-8") as f:
                f.write(fixed_content)
            current_files[first_file] = fixed_content
            await emit(f"Applied fix to {first_file}")

    return {
        **state,
        "test_passed": passed,
        "test_output": output[-5000:] if output else "",
        "retry_count": retry_count,
        "current_files": current_files,
        "log_events": log_events,
    }
