#!/bin/bash
echo "=========================================="
echo "    Quick Fix Dependencies"
echo "=========================================="
echo ""

cd "$(dirname "$0")"

echo "Installing complete dependency packages..."
npm install

echo ""
echo "=========================================="
echo "Fix completed! Restart the application"
echo "=========================================="
