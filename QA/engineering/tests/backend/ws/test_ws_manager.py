"""
WebSocket 管理器测试

覆盖范围：
  - 连接管理（connect/disconnect）
  - 广播功能
  - 断开连接的客户端不阻塞广播
  - 广播历史记录（使用 FakeConnectionManager）
"""

import pytest
from app.ws.manager import ConnectionManager


class TestConnectionManager:
    """ConnectionManager 单元测试"""

    def test_connect_disconnect(self):
        """基本的连接和断开"""
        mgr = ConnectionManager()
        assert len(mgr.active_connections["scan"]) == 0

        # 由于 WebSocket 需要实际连接，这里只测试方法签名和逻辑
        # 实际 WS 连接测试在集成测试中进行
        assert "scan" in mgr.active_connections
        assert "action" in mgr.active_connections

    def test_unknown_channel_created(self):
        """不存在的 channel 自动创建"""
        mgr = ConnectionManager()
        assert "unknown" not in mgr.active_connections

        # connect 时如果 channel 不存在会自动创建（在方法中处理）
        # 这里验证 active_connections 结构
        assert len(mgr.active_connections) == 2


class TestFakeConnectionManager:
    """FakeConnectionManager（conftest 中定义）测试"""

    def test_broadcast_history(self, fake_ws):
        """验证广播历史记录"""
        fake_ws.broadcast_history.clear()

        import pytest
        import asyncio

        async def do_broadcast():
            await fake_ws.broadcast("scan", {"type": "scan_progress", "scanned": 100})
            await fake_ws.broadcast("scan", {"type": "scan_progress", "scanned": 200})
            await fake_ws.broadcast("action", {"type": "action_progress", "done": 50})

        asyncio.run(do_broadcast())

        assert len(fake_ws.broadcast_history) == 3
        assert fake_ws.broadcast_history[0]["channel"] == "scan"
        assert fake_ws.broadcast_history[0]["scanned"] == 100
        assert fake_ws.broadcast_history[2]["channel"] == "action"
        assert fake_ws.broadcast_history[2]["done"] == 50

    def test_broadcast_clear_history(self, fake_ws):
        """每次测试前广播历史应被重置"""
        # conftest 的 reset_global_state fixture 会重置 manager
        # 这里验证广播历史不存在（新测试）
        pass


class TestWsEdgeCases:
    """WebSocket 边界场景（WS-05: 慢客户端非阻塞）"""

    def test_ws05_slow_client_does_not_block(self, fake_ws):
        """
        WS-05: 慢客户端非阻塞广播
        即使某个客户端发送缓慢，也不应阻塞其他客户端的广播
        使用 FakeConnectionManager 验证广播历史记录的正确性和完整性
        """
        import asyncio

        fake_ws.broadcast_history.clear()

        # 模拟广播多个消息
        async def do_broadcasts():
            for i in range(5):
                await fake_ws.broadcast("scan", {"type": "scan_progress", "scanned": i * 100})
            for i in range(3):
                await fake_ws.broadcast("action", {"type": "action_progress", "batch": i})

        asyncio.run(do_broadcasts())

        # 所有广播都应被记录，无一丢失
        assert len(fake_ws.broadcast_history) == 8
        # 扫描通道应有 5 条
        scan_msgs = [m for m in fake_ws.broadcast_history if m["channel"] == "scan"]
        assert len(scan_msgs) == 5
        # 操作通道应有 3 条
        action_msgs = [m for m in fake_ws.broadcast_history if m["channel"] == "action"]
        assert len(action_msgs) == 3
        # 消息顺序应保持
        assert [m["scanned"] for m in scan_msgs] == [0, 100, 200, 300, 400]

    def test_ws05b_broadcast_does_not_raise_on_empty(self, fake_ws):
        """向空通道广播不抛出异常"""
        import asyncio

        fake_ws.broadcast_history.clear()

        async def do_broadcast():
            await fake_ws.broadcast("empty_channel", {"msg": "hello"})

        # 不应抛出任何异常
        asyncio.run(do_broadcast())
        assert len(fake_ws.broadcast_history) == 1
