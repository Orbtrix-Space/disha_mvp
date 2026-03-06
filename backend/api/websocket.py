"""
DISHA Beta — WebSocket API Route
WS /ws/telemetry — server-to-client push, 1 Hz telemetry frame
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["WebSocket"])


def get_deps():
    from backend.main import ws_manager
    return ws_manager


@router.websocket("/ws/telemetry")
async def websocket_telemetry(ws: WebSocket):
    ws_manager = get_deps()
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
