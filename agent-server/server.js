const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
require('dotenv').config(); // Load environment variables from .env file
const app = express();

// Check if Claude CLI is available during server startup
function checkClaudeCode() {
  try {
    execSync('claude --version', { stdio: 'ignore' });
    console.log('✓ Claude CLI is available');
  } catch (error) {
    console.error('✗ Claude CLI is not installed or not in PATH');
    console.error('Please install Claude CLI to use this functionality');
    process.exit(1);
  }
}

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Enable CORS for all origins and allow POST requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Increase JSON payload limit to handle large screenshots
app.use(express.json({ limit: '50mb' }));

function callClaude(userMessage, screenshotPath, res) {
  try {
    const workingDirectory = process.env.AGENT_CODE_DIR; // load from .env (AGENT_CODE_DIR)

    if (!workingDirectory) {
      res.write('event: error\ndata: Missing required AGENT_CODE_DIR environment variable. Please specify an absolute path to the working directory.\n\n');
      res.end();
      return;
    }

    // Validate that the directory path is absolute
    if (!path.isAbsolute(workingDirectory)) {
      res.write('event: error\ndata: The AGENT_CODE_DIR environment variable must be an absolute file path.\n\n');
      res.end();
      return;
    }

    // Validate that the directory exists
    if (!fs.existsSync(workingDirectory)) {
      res.write(`event: error\ndata: Directory does not exist: ${workingDirectory}\n\n`);
      res.end();
      return;
    }

    // Validate that it's actually a directory
    const stats = fs.statSync(workingDirectory);
    if (!stats.isDirectory()) {
      res.write(`event: error\ndata: Path is not a directory: ${workingDirectory}\n\n`);
      res.end();
      return;
    }

    const prompt = `Please analyze the annotated screenshot at ${screenshotPath} and make changes to the code as needed.

Additional context from the user: ${userMessage}

Please make direct changes to the code files based on what you see in the screenshot. Do not make changes outside of the current working directory. Do not just suggest changes - actually implement them. The annotations are low-fidelity and intended to communicate changes, so don't reproduce them exactly. For example, there may be arrows or text that show what changes are desired. The color of the annotations are always red, but that doesn't mean you should make the changes red.`;

    console.log('Prompt being sent to Claude:');
    console.log(prompt);
    console.log('---');

    // Spawn Claude process in headless mode (TODO: made the path to mcp-servers.json configurable)
    const claude = spawn('claude', ['-p', '--mcp-config', '../agent-server/mcp-servers.json', '--allowedTools', 'mcp__filesystem__read_file,mcp__filesystem__read_multiple_files,mcp__filesystem__write_file,mcp__filesystem__edit_file,mcp__filesystem__create_directory,mcp__filesystem__list_directory,mcp__filesystem__move_file,mcp__filesystem__search_files,mcp__filesystem__get_file_info,mcp__filesystem__list_allowed_directories'], {
      cwd: workingDirectory,
      stdio: ['pipe', 'pipe', 'pipe'] // Change stdio to pipe all streams
    });

    // Write the prompt to Claude's stdin
    claude.stdin.write(prompt);
    claude.stdin.end();

    // Stream stdout to the client
    claude.stdout.on('data', (data) => {
      res.write(`event: data\ndata: ${data.toString()}\n\n`);
    });

    // Stream stderr to the client
    claude.stderr.on('data', (data) => {
      res.write(`event: error\ndata: ${data.toString()}\n\n`);
    });

    // Handle process close
    claude.on('close', (code) => {
      if (code === 0) {
        res.write('event: end\ndata: Claude has processed the request and made changes to the code\n\n');
      } else {
        res.write(`event: error\ndata: Claude exited with code ${code}\n\n`);
      }
      res.end();
    });

    // Handle process error
    claude.on('error', (error) => {
      res.write(`event: error\ndata: Claude execution failed: ${error.message}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Error calling Claude:', error);
    res.write(`event: error\ndata: Claude execution failed: ${error.message}\n\n`);
    res.end();
  }
}

app.post('/api/upload', (req, res) => {
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

    res.json({ filename });
  } catch (error) {
    console.error('Error uploading screenshot:', error);
    res.status(500).json({ message: 'Failed to upload screenshot' });
  }
});

app.get('/api/data', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send a heartbeat to keep the connection alive
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 15000); // Send heartbeat every 15 seconds

  req.on('close', () => {
    clearInterval(heartbeat);
    res.end();
  });

  try {
    const filename = req.query.filename;
    const filepath = path.join(screenshotsDir, filename);

    // Validate that the file exists
    if (!fs.existsSync(filepath)) {
      res.write(`event: error\ndata: Screenshot file not found: ${filename}\n\n`);
      res.end();
      return;
    }

    // Call Claude with the saved screenshot and specified working directory, passing the response object
    callClaude(req.query.message, filepath, res);

  } catch (error) {
    console.error('Error processing request:', error);
    res.write(`event: error\ndata: Failed to process request: ${error.message}\n\n`);
    res.end();
  }
});

// Check Claude availability and start server
checkClaudeCode();

app.listen(3001, () => {
  console.log('Server is running on http://localhost:3001');
});