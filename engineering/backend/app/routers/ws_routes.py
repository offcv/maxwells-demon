from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.ws.manager import manager

router = APIRouter()

@router.websocket("/ws/scan/progress")
async def websocket_scan(websocket: WebSocket):
    await manager.connect(websocket, "scan")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "scan")

@router.websocket("/ws/action/progress")
async def websocket_action(websocket: WebSocket):
    await manager.connect(websocket, "action")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "action")
