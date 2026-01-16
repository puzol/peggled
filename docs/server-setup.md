# Server Setup Guide

## Quick Start

### Development Mode (Recommended)

For development, use Vite's dev server which handles ES modules correctly:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the dev server:**
   ```bash
   npm run dev
   ```
   or
   ```bash
   npm start
   ```

3. **Access the game:**
   - **Local:** http://localhost:3000
   - **Network:** http://[YOUR_IP]:3000 (shown in console)

### Production Mode

For production, build first then serve:

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Preview the build:**
   ```bash
   npm run preview
   ```

   Or use the Express server:
   ```bash
   npm run server
   ```

## Network Access

The server binds to `0.0.0.0`, making it accessible from:
- Your local machine (localhost)
- Other devices on your local network (via your IP address)
- Any device that can reach your IP (if firewall allows)

### Finding Your IP Address

The server will automatically display your local IP address when it starts. You can also find it manually:

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

**Mac/Linux:**
```bash
ifconfig
```
or
```bash
ip addr
```

### Firewall Configuration

If other devices can't connect, you may need to allow the port through your firewall:

**Windows:**
1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Create a new Inbound Rule for port 3000

**Mac:**
```bash
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/node
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /path/to/node
```

## Environment Variables

- `PORT` - Server port (default: 3000)
  ```bash
  PORT=8080 npm run server
  ```

## Development vs Production

### Development (Current)
- Simple Express static file server
- Serves files directly from project directory
- Good for local testing and development

### Production (Future)
- Serve built/optimized files from `dist/` folder
- Add compression, caching headers
- Use a process manager (PM2)
- Set up reverse proxy (nginx)
- Enable HTTPS

## Troubleshooting

### Port Already in Use
If port 3000 is already in use:
```bash
PORT=3001 npm run server
```

### Can't Access from Other Devices
1. Check firewall settings
2. Ensure both devices are on the same network
3. Verify the IP address is correct
4. Try disabling VPN if active

### Game Not Loading
- Check browser console for errors
- Verify all files are being served correctly
- Check that Vite build completed successfully (if using production build)

