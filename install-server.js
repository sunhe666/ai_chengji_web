const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('.'));

app.post('/api/install-dependencies', (req, res) => {
    const { skipPdf = false } = req.body;
    
    console.log('Installing dependencies...', { skipPdf });
    
    const env = { ...process.env };
    env.PUPPETEER_SKIP_DOWNLOAD = 'true';
    env.npm_config_registry = 'https://registry.npmmirror.com';
    
    let args;
    if (skipPdf) {
        args = ['install', 'express', 'multer', 'xlsx', 'chart.js', 'fs-extra', 'cors', '--no-optional'];
    } else {
        args = ['install'];
    }
    
    const child = spawn('npm', args, { env, stdio: 'pipe' });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
        output += data.toString();
        console.log('STDOUT:', data.toString());
    });
    
    child.stderr.on('data', (data) => {
        error += data.toString();
        console.log('STDERR:', data.toString());
    });
    
    child.on('close', (code) => {
        console.log('Installation finished, code:', code);
        
        // Start main app
        if (code === 0) {
            setTimeout(() => {
                const mainApp = spawn('node', ['server.js'], { detached: true, stdio: 'ignore' });
                mainApp.unref();
            }, 1000);
        }
        
        res.json({
            success: code === 0,
            code,
            output,
            error,
            message: code === 0 ? 'Installation successful' : 'Installation failed'
        });
        
        // Close installer server
        setTimeout(() => process.exit(0), 3000);
    });
    
    child.on('error', (err) => {
        res.json({
            success: false,
            error: err.message,
            message: 'Installation failed'
        });
    });
});

app.listen(PORT, () => {
    console.log(`Installer server running on http://localhost:${PORT}`);
});
