import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the project root
app.use(express.static(__dirname));

// Serve the game at the root
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

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

