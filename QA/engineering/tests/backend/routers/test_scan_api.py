"""
扫描 API 路由测试

覆盖范围：
  API-01: 启动扫描
  API-08: 并发扫描拒绝
  API-09: 取消扫描
  新增：状态查询、参数验证
"""

import json
import pytest
from unittest.mock import patch
from app.services.scan_engine import current_scan


class TestScanAPI:
    """扫描 API 测试"""

    # ── API-01: 启动扫描 ──
    def test_start_scan(self, client, tmp_fs):
        """POST /api/scan/start → 返回 session_id"""
        # 创建一个测试目录
        import os
        os.makedirs(os.path.join(tmp_fs, "data"), exist_ok=True)

        resp = client.post("/api/scan/start", json={
            "scan_paths": [{"path": tmp_fs, "is_exclude": False}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "Scan started"
        assert "session_id" in data
        assert len(data["session_id"]) > 0

    # ── API-01: 启动扫描（空路径列表） ──
    def test_start_scan_empty_paths(self, client):
        """空路径列表也能启动扫描"""
        resp = client.post("/api/scan/start", json={
            "scan_paths": [],
        })
        assert resp.status_code == 200

    # ── API-08: 并发扫描拒绝 ──
    def test_concurrent_scan_rejected(self, client):
        """同一时间只允许一个扫描 → 第二个返回错误"""
        # 模拟扫描正在进行
        current_scan.status = "phase1"
        current_scan.session_id = "test-session-123"

        resp = client.post("/api/scan/start", json={
            "scan_paths": [{"path": "/tmp", "is_exclude": False}],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data
        assert "already running" in data["error"].lower()

        # 恢复状态
        current_scan.status = "idle"

    # ── API-09: 取消扫描 ──
    def test_cancel_scan(self, client):
        """POST /api/scan/cancel → 设置取消标志"""
        current_scan.status = "phase1"
        current_scan.cancel_flag = False

        resp = client.post("/api/scan/cancel")
        assert resp.status_code == 200
        assert current_scan.cancel_flag is True

        current_scan.status = "idle"
        current_scan.cancel_flag = False

    def test_cancel_no_active_scan(self, client):
        """无活跃扫描时取消 → 返回提示"""
        current_scan.status = "idle"
        resp = client.post("/api/scan/cancel")
        assert resp.status_code == 200
        assert "No active scan" in resp.json()["message"]

    # ── 获取扫描状态 ──
    def test_get_status(self, client):
        """GET /api/scan/status → 当前扫描状态"""
        current_scan.status = "idle"
        current_scan.session_id = None
        current_scan.scanned_total = 0

        resp = client.get("/api/scan/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert data["status"] == "idle"
