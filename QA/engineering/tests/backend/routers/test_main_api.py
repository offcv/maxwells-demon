"""
全局 API 路由测试（main.py 直挂端点）

覆盖范围：
  - GET /api/config：运行环境信息（前端据此切换"打开所在文件夹"/"复制路径"行为）
"""

import pytest
from app.config import settings


class TestConfigAPI:
    """运行环境信息端点"""

    def test_get_config_defaults(self, client):
        """默认（本地开发）环境：docker_mode 为假，host_nas_path 为空"""
        resp = client.get("/api/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["docker_mode"] is False
        assert "nas_root" in data
        assert data["host_nas_path"] == ""

    def test_get_config_docker_mode(self, client):
        """Docker/NAS 环境：docker_mode 为真并携带宿主机路径"""
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(settings, "DOCKER_MODE", True)
            mp.setattr(settings, "HOST_NAS_PATH", "/volume1")
            resp = client.get("/api/config")
        assert resp.status_code == 200
        data = resp.json()
        assert data["docker_mode"] is True
        assert data["host_nas_path"] == "/volume1"
