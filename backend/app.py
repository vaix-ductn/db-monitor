import os
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis

REDIS_HOST = os.environ.get("REDIS_HOST", "cdc-redis")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/schema")
async def get_schema():
    r = aioredis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
    data = await r.get("db_schema")
    await r.aclose()
    if data:
        return json.loads(data)
    return {}


@app.get("/events")
async def get_events():
    r = aioredis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
    items = await r.lrange("db_events", 0, 499)
    await r.aclose()
    return [json.loads(item) for item in items]


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    r = aioredis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe("db_changes")
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await pubsub.unsubscribe("db_changes")
        await r.aclose()
