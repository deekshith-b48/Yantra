import os
import re
import fnmatch
from pathlib import Path
from typing import Generator

import chromadb

SKIP_DIRS = {
    "node_modules", ".git", "dist", "__pycache__", ".next",
    "build", "coverage", ".turbo", "vendor", ".cache",
}
SKIP_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".zip", ".tar", ".gz", ".lock",
    ".min.js", ".min.css",
}
MAX_FILE_SIZE = 500 * 1024  # 500 KB


def _should_skip(path: str, root: str) -> bool:
    rel = os.path.relpath(path, root)
    parts = rel.split(os.sep)
    if any(p in SKIP_DIRS for p in parts):
        return True
    ext = "".join(Path(path).suffixes[-2:])  # handle .min.js
    if ext in SKIP_EXTENSIONS:
        return True
    if os.path.getsize(path) > MAX_FILE_SIZE:
        return True
    return False


def _walk_files(root: str) -> Generator[str, None, None]:
    gitignore_patterns: list[str] = []
    gi_path = os.path.join(root, ".gitignore")
    if os.path.exists(gi_path):
        with open(gi_path) as f:
            gitignore_patterns = [
                line.strip() for line in f
                if line.strip() and not line.startswith("#")
            ]

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for filename in filenames:
            full = os.path.join(dirpath, filename)
            if _should_skip(full, root):
                continue
            rel = os.path.relpath(full, root)
            if any(fnmatch.fnmatch(rel, pat) for pat in gitignore_patterns):
                continue
            try:
                with open(full, "r", encoding="utf-8", errors="ignore") as fh:
                    content = fh.read()
                yield full, rel, content
            except Exception:
                continue


def _extract_symbols(content: str, rel_path: str) -> list[dict]:
    """Chunk by function/class boundaries using simple regex (tree-sitter fallback)."""
    chunks = []
    ext = Path(rel_path).suffix

    if ext in {".ts", ".tsx", ".js", ".jsx"}:
        pattern = re.compile(
            r"(?:^|\n)((?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\([^)]*\)\s*:))[^\n]*)",
            re.MULTILINE,
        )
    elif ext == ".py":
        pattern = re.compile(
            r"(?:^|\n)((?:async\s+)?(?:def|class)\s+\w+[^\n]*)",
            re.MULTILINE,
        )
    else:
        pattern = None

    if pattern:
        positions = [m.start() for m in pattern.finditer(content)]
        positions.append(len(content))
        for i, start in enumerate(positions[:-1]):
            end = positions[i + 1]
            chunk_text = content[start:end].strip()
            if len(chunk_text) < 20:
                continue
            chunks.append({"text": chunk_text[:4000], "path": rel_path, "chunk_index": i})
    else:
        # Fixed-size fallback: 100-line chunks
        lines = content.splitlines()
        for i in range(0, len(lines), 100):
            chunk_text = "\n".join(lines[i : i + 100])
            chunks.append({"text": chunk_text[:4000], "path": rel_path, "chunk_index": i // 100})

    return chunks


def get_chroma_client() -> chromadb.HttpClient:
    host = os.getenv("CHROMA_HOST", "localhost")
    port = int(os.getenv("CHROMA_PORT", "8001"))
    return chromadb.HttpClient(host=host, port=port)


async def index_repo(run_id: str, repo_path: str, emit_log) -> int:
    """Index the repo into ChromaDB. Returns total chunks indexed."""
    import asyncio
    from anthropic import AsyncAnthropic

    chroma = get_chroma_client()
    collection = chroma.get_or_create_collection(
        name=f"run_{run_id.replace('-', '_')}",
        metadata={"hnsw:space": "cosine"},
    )

    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    all_chunks = []
    file_count = 0

    for full_path, rel_path, content in _walk_files(repo_path):
        file_count += 1
        chunks = _extract_symbols(content, rel_path)
        all_chunks.extend(chunks)

    if not all_chunks:
        await emit_log("No indexable files found.")
        return 0

    await emit_log(f"Embedding {len(all_chunks)} chunks from {file_count} files...")

    # Batch embed with voyage-code-3 via Anthropic
    BATCH = 32
    for batch_start in range(0, len(all_chunks), BATCH):
        batch = all_chunks[batch_start : batch_start + BATCH]
        texts = [c["text"] for c in batch]

        # Use voyage embeddings via anthropic client
        response = await client.post(
            "/v1/embeddings",
            body={"model": "voyage-code-3", "input": texts},
            cast_to=object,
        )
        embeddings = [item["embedding"] for item in response["data"]]

        ids = [f"{run_id}_{batch_start + i}" for i in range(len(batch))]
        metadatas = [{"path": c["path"], "chunk_index": c["chunk_index"]} for c in batch]

        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )

    await emit_log(f"Indexed {len(all_chunks)} chunks from {file_count} files")
    return len(all_chunks)


async def semantic_search(run_id: str, query: str, n_results: int = 15) -> list[dict]:
    """Search ChromaDB for chunks relevant to query."""
    import asyncio
    from anthropic import AsyncAnthropic

    chroma = get_chroma_client()
    collection_name = f"run_{run_id.replace('-', '_')}"

    try:
        collection = chroma.get_collection(collection_name)
    except Exception:
        return []

    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = await client.post(
        "/v1/embeddings",
        body={"model": "voyage-code-3", "input": [query]},
        cast_to=object,
    )
    query_embedding = response["data"][0]["embedding"]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),
        include=["documents", "metadatas"],
    )

    chunks = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        chunks.append({"text": doc, "path": meta["path"]})
    return chunks
