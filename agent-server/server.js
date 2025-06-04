const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Enable CORS for all origins and allow POST requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Increase JSON payload limit to handle large screenshots
app.use(express.json({ limit: '50mb' }));

app.post('/api/data', async (req, res) => {
  try { 
    // Extract base64 data from data URL
    const base64Data = req.body.screenshot.replace(/^data:image\/png;base64,/, '');
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot_${timestamp}.png`;
    const filepath = path.join(screenshotsDir, filename);
    
    // Save screenshot to file
    fs.writeFileSync(filepath, base64Data, 'base64');
    console.log(`Screenshot saved: ${filename}`);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      message: 'Failed to process request'
    });
  }
});

app.listen(3001, () => {
  console.log('Server is running on http://localhost:3001');
});