#!/bin/bash
echo "Grade Analysis System - Mac Installer"
echo "===================================="

cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js not installed, installing..."
    
    # Try Homebrew installation
    if command -v brew &> /dev/null; then
        brew install node
    else
        echo "Please install Node.js manually:"
        echo "1. Visit https://nodejs.org"
        echo "2. Download LTS version"
        echo "3. Run this script again after installation"
        exit 1
    fi
else
    echo "Node.js is already installed"
fi

echo "Checking Python environment for advanced features..."
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "Python not installed, installing Python for advanced PDF features..."
    
    # Try Homebrew Python installation
    if command -v brew &> /dev/null; then
        brew install python
        echo "Python installation completed"
    else
        echo "Please install Python manually for full features, or continue with basic features"
    fi
else
    echo "Python is already installed"
fi

echo "Installing core dependencies..."
npm install express multer xlsx chart.js fs-extra cors --save

if [ $? -eq 0 ]; then
    echo "Installing PDF generation libraries..."
    npm install pdf-lib --save
    
    echo "Installing Chart.js server-side rendering..."
    npm install chartjs-node-canvas --save
    
    echo "Installing advanced PDF and analysis features..."
    npm install html-pdf-node puppeteer openai axios natural --save
    
    if [ $? -ne 0 ]; then
        echo "Some advanced features installation failed - core functions still work"
    fi
fi

if [ $? -eq 0 ]; then
    echo "Creating start script..."
    cat > start.command << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
node server.js
EOF
    
    chmod +x start.command
    
    echo "Installation completed!"
    echo "Double-click start.command to run the program"
else
    echo "Dependency installation failed, please check network"
fi
