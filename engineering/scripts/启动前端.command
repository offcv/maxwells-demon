#!/bin/bash
cd "$(dirname "$0")/../frontend" || { echo "❌ 目录不存在"; read -p "按回车键退出..."; exit 1; }

if [ ! -d node_modules ]; then
    echo "⚠️  node_modules 不存在，正在安装依赖..."
    npm install || { echo "❌ npm install 失败"; read -p "按回车键退出..."; exit 1; }
fi

echo "✅ 启动前端开发服务器..."
npm run dev
echo "❌ 前端服务已停止"
read -p "按回车键退出..."