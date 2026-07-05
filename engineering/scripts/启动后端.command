#!/bin/bash
cd "$(dirname "$0")/../backend" || { echo "❌ 目录不存在"; read -p "按回车键退出..."; exit 1; }

if lsof -i :8000 > /dev/null 2>&1; then
    echo "⚠️  端口 8000 已被占用，后端可能已在运行中。"
    read -p "按回车键退出..."
    exit 0
fi

if [ ! -d "venv" ]; then
    echo "⚠️  虚拟环境不存在，正在创建..."
    python3 -m venv venv || { echo "❌ 虚拟环境创建失败"; read -p "按回车键退出..."; exit 1; }
fi

source venv/bin/activate || { echo "❌ 虚拟环境激活失败"; read -p "按回车键退出..."; exit 1; }

echo "✅ 正在检查并安装依赖..."
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple || { echo "❌ 依赖安装失败"; read -p "按回车键退出..."; exit 1; }

echo "✅ 启动后端服务 (port 8000)..."
uvicorn app.main:app --host 0.0.0.0 --port 8000
echo "❌ 后端服务已停止"
read -p "按回车键退出..."