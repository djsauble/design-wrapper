const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
require('dotenv').config({ path: '../.env' }); // Load environment variables from .env file
let initialMainBranchHead = null; // Declare initialMainBranchHead
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

function callClaude(userMessage, screenshotPath, promptTemplate, res) {
  try {
    const workingDirectory = process.env.TARGET_APP_PATH;
    const targetAppEntryPoint = process.env.TARGET_APP_ENTRY_POINT;

    if (!workingDirectory) {
      res.write('event: error\ndata: Missing required TARGET_APP_PATH environment variable. Please specify an absolute path to the working directory.\n\n');
      res.end();
      return;
    }

    if (!targetAppEntryPoint) {
      res.write('event: error\ndata: Missing required TARGET_APP_ENTRY_POINT environment variable. Please specify the entry point of the target application (e.g. src/App).\n\n');
      res.end();
      return;
    }

    // Validate that the directory path is absolute
    if (!path.isAbsolute(workingDirectory)) {
      res.write('event: error\ndata: The TARGET_APP_PATH environment variable must be an absolute file path.\n\n');
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

    // Validate that the target component path is valid
    const targetComponentPath = `${workingDirectory}/${targetAppEntryPoint}`;
    if (!fs.existsSync(targetComponentPath)) {
      res.write(`event: error\ndata: Target component path does not exist: ${targetComponentPath}\n\n`);
      res.end();
      return;
    }

    const prompt = promptTemplate
      .replace('${targetComponentPath}', targetComponentPath)
      .replace('${screenshotPath}', screenshotPath)
      .replace('${userMessage}', userMessage);

    // Spawn Claude process in headless mode
    const claude = spawn('claude',
      [
        '-p',
        '--mcp-config', '{ "mcpServers": { "filesystem": { "command": "npx", "args": [ "-y", "@modelcontextprotocol/server-filesystem", ".", "' + screenshotsDir + '" ] } } }',
        '--allowedTools', 'Read,mcp__filesystem__read_file,mcp__filesystem__read_multiple_files,mcp__filesystem__write_file,mcp__filesystem__edit_file,mcp__filesystem__create_directory,mcp__filesystem__list_directory,mcp__filesystem__move_file,mcp__filesystem__search_files,mcp__filesystem__get_file_info,mcp__filesystem__list_allowed_directories'
      ],
      {
        cwd: workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'] // Change stdio to pipe all streams
      }
    );

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
        try {
          // Commit the changes
          execSync('git add .', { cwd: workingDirectory });
          execSync('git commit -m "Claude made changes"', { cwd: workingDirectory });
          console.log('✓ Changes committed to Git');
          res.write(`event: end\ndata: Claude has processed the request and made changes to the code.\n\n`);
        } catch (gitError) {
          console.error('Error committing changes:', gitError);
          res.write(`event: error\ndata: Failed to commit changes: ${gitError.message}\n\n`);
        }
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

    const workingDirectory = process.env.TARGET_APP_PATH;
    ensureGitBranch(workingDirectory);

    // Call Claude with the saved screenshot and specified working directory, passing the response object
    callClaude(req.query.message, filepath, req.query.promptTemplate, res);

  } catch (error) {
    console.error('Error processing request:', error);
    res.write(`event: error\ndata: Failed to process request: ${error.message}\n\n`);
    res.end();
  }
});

function ensureGitBranch(workingDirectory) {
  try {
    // Check if the working directory is a git repository
    execSync('git rev-parse --is-inside-work-tree', { cwd: workingDirectory, stdio: 'ignore' });
    console.log(`✓ ${workingDirectory} is a git repository`);
  } catch (error) {
    // If not a git repository, initialize one
    console.log(`✗ ${workingDirectory} is not a git repository. Initializing...`);
    execSync('git init', { cwd: workingDirectory });
    console.log(`✓ Initialized git repository in ${workingDirectory}`);
  }

  // Check current branch and switch to a feature branch if needed
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: workingDirectory }).toString().trim();
    if (!currentBranch.startsWith('claude-feature-')) {
      // Capture the current main branch head before creating a feature branch
      if (initialMainBranchHead === null) {
        try {
          initialMainBranchHead = execSync('git rev-parse main || git rev-parse master', { cwd: workingDirectory }).toString().trim();
          console.log(`✓ Captured initial main branch head: ${initialMainBranchHead}`);
        } catch (getMainBranchError) {
          console.error('Error getting main branch head:', getMainBranchError);
          // If unable to get main branch head, set to current commit as a fallback
          initialMainBranchHead = execSync('git rev-parse HEAD', { cwd: workingDirectory }).toString().trim();
          console.log(`✗ Failed to get main branch head, using current commit as fallback: ${initialMainBranchHead}`);
        }
      }

      // Create a unique feature branch name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const featureBranch = `claude-feature-${timestamp}`;
      execSync(`git checkout -b ${featureBranch}`, { cwd: workingDirectory });
      console.log(`✓ Created and switched to feature branch: ${featureBranch}`);
    } else {
      console.log(`✓ Already on feature branch: ${currentBranch}`);
    }
  } catch (branchError) {
    console.error('Error ensuring feature branch:', branchError);
  }
}

// Undo endpoint
app.post('/api/undo', (req, res) => {
  try {
    const workingDirectory = process.env.TARGET_APP_PATH;
    const currentCommit = execSync('git rev-parse HEAD', { cwd: workingDirectory }).toString().trim();
    const parentCommit = execSync('git rev-parse HEAD^', { cwd: workingDirectory }).toString().trim();

    if (parentCommit !== initialMainBranchHead) {
      execSync(`git checkout ${parentCommit}`, { cwd: workingDirectory });
      console.log(`✓ Checked out previous commit: ${parentCommit}`);
      res.json({ message: `Checked out previous commit: ${parentCommit}` });
    } else {
      console.log('Already at the initial main branch commit. Cannot undo further.');
      res.status(400).json({ message: 'Already at the initial main branch commit. Cannot undo further.' });
    }
  } catch (error) {
    console.error('Error undoing:', error);
    res.status(500).json({ message: 'Failed to undo', error: error.message });
  }
});

// Redo endpoint
app.post('/api/redo', (req, res) => {
  try {
    const workingDirectory = process.env.TARGET_APP_PATH;
    const currentCommit = execSync('git rev-parse HEAD', { cwd: workingDirectory }).toString().trim();
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: workingDirectory }).toString().trim();
    const latestCommit = execSync(`git rev-parse ${currentBranch}`, { cwd: workingDirectory }).toString().trim();

    if (currentCommit !== latestCommit) {
      const nextCommit = execSync(`git log --reverse --ancestry-path ${currentCommit}..${currentBranch} --format="%H" | head -n 1`, { cwd: workingDirectory }).toString().trim();
      if (nextCommit) {
        execSync(`git checkout ${nextCommit}`, { cwd: workingDirectory });
        console.log(`✓ Checked out next commit: ${nextCommit}`);
        res.json({ message: `Checked out next commit: ${nextCommit}` });
      } else {
        console.log('No next commit found on the current branch.');
        res.status(400).json({ message: 'No next commit found on the current branch.' });
      }
    } else {
      console.log('Already at the latest commit on the current branch. Cannot redo further.');
      res.status(400).json({ message: 'Already at the latest commit on the current branch. Cannot redo further.' });
    }
  } catch (error) {
    console.error('Error redoing:', error);
    res.status(500).json({ message: 'Failed to redo', error: error.message });
  }
});

// Reset endpoint
app.post('/api/reset', (req, res) => {
  try {
    const workingDirectory = process.env.TARGET_APP_PATH;
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: workingDirectory }).toString().trim();

    // Checkout main branch
    execSync('git checkout main || git checkout master', { cwd: workingDirectory });
    console.log('✓ Checked out main branch');

    // Delete feature branch
    if (currentBranch.startsWith('claude-feature-')) {
      execSync(`git branch -D ${currentBranch}`, { cwd: workingDirectory });
      console.log(`✓ Deleted feature branch: ${currentBranch}`);
    }

    initialMainBranchHead = null;
    res.json({ message: 'Reset to main branch and deleted feature branch' });
  } catch (error) {
    console.error('Error resetting:', error);
    res.status(500).json({ message: 'Failed to reset', error: error.message });
  }
});

// Approve endpoint (squash merge)
app.post('/api/approve', (req, res) => {
  try {
    const workingDirectory = process.env.TARGET_APP_PATH;
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: workingDirectory }).toString().trim();

    if (!currentBranch.startsWith('claude-feature-')) {
        res.status(400).json({ message: 'Not on a feature branch. Cannot approve.' });
        return;
    }

    // Checkout main branch
    execSync('git checkout main || git checkout master', { cwd: workingDirectory });
    console.log('✓ Checked out main branch');

    // Squash merge feature branch
    execSync(`git merge --squash ${currentBranch}`, { cwd: workingDirectory });
    console.log(`✓ Squashed merged ${currentBranch}`);

    // Commit squash merge
    execSync(`git commit -m "Squash merge of ${currentBranch}"`, { cwd: workingDirectory });
    console.log('✓ Committed squash merge');

    // Delete feature branch
    execSync(`git branch -D ${currentBranch}`, { cwd: workingDirectory });
    console.log(`✓ Deleted feature branch: ${currentBranch}`);

    initialMainBranchHead = null;
    res.json({ message: `Squash merged ${currentBranch} into main and deleted feature branch` });
  } catch (error) {
    console.error('Error approving:', error);
    res.status(500).json({ message: 'Failed to approve', error: error.message });
  }
});


// Check Claude availability and start server
checkClaudeCode();

app.listen(3001, () => {
  console.log('Server is running on http://localhost:3001');
});