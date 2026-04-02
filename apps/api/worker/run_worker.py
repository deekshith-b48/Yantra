"""
Entry point for the YANTRA background worker.
Run with: python -m worker.run_worker
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

from worker.processor import worker_main

if __name__ == "__main__":
    asyncio.run(worker_main())
