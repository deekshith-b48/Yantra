import os
import anthropic

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


async def complete(
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 8192,
) -> str:
    client = get_client()
    messages = [{"role": "user", "content": prompt}]
    kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        kwargs["system"] = system

    response = await client.messages.create(**kwargs)
    return response.content[0].text


async def stream_complete(
    prompt: str,
    system: str = "",
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 8192,
):
    """Async generator that yields text chunks as they stream."""
    client = get_client()
    messages = [{"role": "user", "content": prompt}]
    kwargs = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if system:
        kwargs["system"] = system

    async with client.messages.stream(**kwargs) as stream:
        async for text in stream.text_stream:
            yield text
