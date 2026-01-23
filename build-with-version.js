import { build } from 'vite';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Generate build version (timestamp-based)
const now = new Date();
const buildVersion = now.getTime().toString(36); // Base36 encoding for shorter string

console.log(`Building with version: ${buildVersion}`);

// Build with Vite
await build();

// After build, replace version placeholder in HTML
const distHtmlPath = join(process.cwd(), 'dist', 'index.html');
try {
    let html = readFileSync(distHtmlPath, 'utf-8');
    html = html.replace(/__BUILD_VERSION__/g, buildVersion);
    writeFileSync(distHtmlPath, html, 'utf-8');
    console.log(`Updated HTML with version: ${buildVersion}`);
} catch (error) {
    console.error('Error updating HTML:', error);
}

