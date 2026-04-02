import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import runs, stream, webhooks, repos
from db.models import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    yield
    await db.disconnect()


app = FastAPI(
    title="YANTRA API",
    description="Autonomous spec-to-ship agent backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs.router, prefix="/runs", tags=["runs"])
app.include_router(stream.router, prefix="/runs", tags=["stream"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(repos.router, prefix="/repos", tags=["repos"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "yantra-api"}
