#!/bin/bash
echo "=========================================="
echo "    Grade Analysis System - Mac启动器"
echo "=========================================="
echo

# 切换到脚本所在目录
cd "$(dirname "$0")"

echo "检查Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    echo "请先安装Node.js:"
    echo "1. 访问 https://nodejs.org"
    echo "2. 下载LTS版本"
    echo "3. 安装后重新运行此脚本"
    exit 1
else
    echo "✅ Node.js 已安装: $(node --version)"
fi

echo
echo "检查npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未找到"
    exit 1
else
    echo "✅ npm 已安装: $(npm --version)"
fi

echo
echo "检查依赖..."
node -e "try { require('express'); console.log('✅ 核心依赖已安装'); } catch (e) { console.log('❌ 依赖缺失，正在安装...'); process.exit(1); }"

if [ $? -ne 0 ]; then
    echo
    echo "安装核心依赖..."
    npm install express multer xlsx chart.js fs-extra cors --save
    
    if [ $? -eq 0 ]; then
        echo "✅ 依赖安装成功"
    else
        echo "❌ 依赖安装失败，请检查网络连接"
        exit 1
    fi
fi

echo
echo "检查必要文件..."
files=("server.js" "public/index.html" "public/js/app.js" "public/css/style.css" "package.json")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file 存在"
    else
        echo "❌ $file 缺失"
        exit 1
    fi
done

echo
echo "=========================================="
echo "           启动服务器"
echo "=========================================="
echo
echo "服务器地址: http://localhost:3001"
echo "在浏览器中打开上述地址"
echo "按 Ctrl+C 停止服务器"
echo

# 启动服务器
node server.js
