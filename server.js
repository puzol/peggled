import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import os from 'os';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Check if dist folder exists (production build)
const distPath = join(__dirname, 'dist');
const isProduction = existsSync(distPath);

if (isProduction) {
    // Production: Serve built files from dist
    app.use(express.static(distPath));
    
    // Serve index.html for all routes (SPA fallback)
    app.get('*', (req, res) => {
        res.sendFile(join(distPath, 'index.html'));
    });
    
    console.log('📦 Serving production build from dist/');
} else {
    // Development: Show message to use Vite dev server
    app.get('*', (req, res) => {
        res.send(`
            <html>
                <head><title>Development Mode</title></head>
                <body style="font-family: Arial; padding: 40px; background: #1a1a2e; color: white;">
                    <h1>🚀 Development Mode</h1>
                    <p>For development, please use Vite's dev server:</p>
                    <pre style="background: #2a2a3e; padding: 20px; border-radius: 5px;">npm run dev</pre>
                    <p>This will start Vite on port 3000 with ES module support.</p>
                    <p>For production, build first:</p>
                    <pre style="background: #2a2a3e; padding: 20px; border-radius: 5px;">npm run build
npm run preview</pre>
                </body>
            </html>
        `);
    });
    
    console.log('⚠️  No production build found. Use "npm run dev" for development.');
    console.log('   Or build first with "npm run build" then use "npm run preview"');
}

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const server = createServer(app);

server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('\n🎮 Peggle Clone Server Running!\n');
    console.log(`📍 Local:    http://localhost:${PORT}`);
    console.log(`🌐 Network:  http://${localIP}:${PORT}\n`);
    console.log('Press Ctrl+C to stop the server\n');
});

