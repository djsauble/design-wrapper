const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
require('dotenv').config({ path: '../.env' }); // Load environment variables from .env file
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

// Helper function to initialize git repository if needed
async function initializeGitRepository(workingDirectory) {
  if (!workingDirectory) {
    throw new Error('Missing required TARGET_APP_PATH environment variable. Please specify an absolute path to the working directory.');
  }

  // Validate that the directory path is absolute
  if (!path.isAbsolute(workingDirectory)) {
    throw new Error('The TARGET_APP_PATH environment variable must be an absolute file path.');
  }

  // Validate that the directory exists
  if (!fs.existsSync(workingDirectory)) {
    throw new Error(`Directory does not exist: ${workingDirectory}`);
  }

  // Validate that it's actually a directory
  const stats = fs.statSync(workingDirectory);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${workingDirectory}`);
  }

  try {
    // Check if it's a git repository
    execSync('git status', { cwd: workingDirectory, stdio: 'ignore' });
    console.log(`✓ ${workingDirectory} is already a Git repository`);
  } catch (error) {
    // Not a git repository, initialize it
    console.log(`✗ ${workingDirectory} is not a Git repository. Initializing...`);
    execSync('git init', { cwd: workingDirectory });
    console.log(`✓ Git repository initialized in ${workingDirectory}`);

    try {
      // Check if there are any commits
      execSync('git rev-parse HEAD', { cwd: workingDirectory, stdio: 'ignore' });
      console.log(`✓ ${workingDirectory} already has commits`);
    } catch (commitError) {
      // No commits, make an initial commit
      console.log(`✗ ${workingDirectory} has no commits. Making initial commit...`);
      execSync('git add .', { cwd: workingDirectory });
      execSync('git commit -m "Initial commit"', { cwd: workingDirectory });
      console.log(`✓ Initial commit made in ${workingDirectory}`);
    }
  }
}

function callClaude(userMessage, screenshotPath, promptTemplate, res) {
  try {
    const workingDirectory = process.env.TARGET_APP_PATH;
    const targetAppEntryPoint = process.env.TARGET_APP_ENTRY_POINT;

    if (!targetAppEntryPoint) {
      res.write('event: error\ndata: Missing required TARGET_APP_ENTRY_POINT environment variable. Please specify the entry point of the target application (e.g. src/App).\n\n');
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
    console.log(screenshotsDir);
    const claude = spawn('claude',
      [
        '-p',
        '--model', 'claude-sonnet-4-20250514', // TODO: It should be possible to use a cheaper model like claude-3-5-haiku-20241022, but would require some prompt engineering probably
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

async function ensureClaudeBranch(workingDirectory) {
  try {
    const currentBranch = execSync('git branch --show-current', { cwd: workingDirectory }).toString().trim();
    if (!currentBranch.startsWith('claude-feature-')) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newBranchName = `claude-feature-${timestamp}`;
      execSync(`git checkout -b ${newBranchName}`, { cwd: workingDirectory });
      console.log(`✓ Switched to new branch: ${newBranchName}`);
      return newBranchName;
    }
    console.log(`✓ Already on branch: ${currentBranch}`);
    return currentBranch;
  } catch (error) {
    console.error('Error ensuring Claude branch:', error);
    throw error; // Re-throw to be caught by the calling function
  }
}

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
    const workingDirectory = process.env.TARGET_APP_PATH;

    // Validate that the file exists
    if (!fs.existsSync(filepath)) {
      res.write(`event: error\ndata: Screenshot file not found: ${filename}\n\n`);
      res.end();
      return;
    }

    // Ensure we are on a claude-feature branch
    await ensureClaudeBranch(workingDirectory);

    // Call Claude with the saved screenshot and specified working directory, passing the response object
    callClaude(req.query.message, filepath, req.query.promptTemplate, res);

  } catch (error) {
    console.error('Error processing request:', error);
    res.write(`event: error\ndata: Failed to process request: ${error.message}\n\n`);
    res.end();
  }
});

// Undo endpoint
app.post('/api/undo', (req, res) => {
  const workingDirectory = process.env.TARGET_APP_PATH;
  if (!workingDirectory) {
    return res.status(400).json({ message: 'Missing required TARGET_APP_PATH environment variable.' });
  }

  try {
    const currentBranch = execSync('git branch --show-current', { cwd: workingDirectory }).toString().trim();
    if (currentBranch.startsWith('claude-feature-')) {
      const mainBranchHead = execSync('git rev-parse main', { cwd: workingDirectory }).toString().trim();
      const currentCommit = execSync('git rev-parse HEAD', { cwd: workingDirectory }).toString().trim();

      if (currentCommit === mainBranchHead) {
        return res.status(400).json({ message: 'Cannot undo further than the main branch HEAD.' });
      }

      execSync('git reset --hard HEAD^', { cwd: workingDirectory });
      console.log('✓ Undid last commit');
      res.json({ message: 'Undo successful' });
    } else {
      res.status(400).json({ message: 'Not on a claude-feature branch.' });
    }
  } catch (error) {
    console.error('Error undoing changes:', error);
    res.status(500).json({ message: 'Failed to undo changes', error: error.message });
  }
});

// Reset endpoint
app.post('/api/reset', (req, res) => {
  const workingDirectory = process.env.TARGET_APP_PATH;
  if (!workingDirectory) {
    return res.status(400).json({ message: 'Missing required TARGET_APP_PATH environment variable.' });
  }

  try {
    const currentBranch = execSync('git branch --show-current', { cwd: workingDirectory }).toString().trim();
    if (currentBranch.startsWith('claude-feature-')) {
      execSync('git reset --hard', { cwd: workingDirectory }); // Reset any staged changes
      execSync('git checkout main', { cwd: workingDirectory }); // Checkout main branch
      execSync(`git branch -D ${currentBranch}`, { cwd: workingDirectory }); // Delete the feature branch
      console.log(`✓ Reset and deleted branch: ${currentBranch}`);
      res.json({ message: 'Reset successful' });
    } else {
      res.status(400).json({ message: 'Not on a claude-feature branch.' });
    }
  } catch (error) {
    console.error('Error resetting changes:', error);
    res.status(500).json({ message: 'Failed to reset changes', error: error.message });
  }
});

// Approve endpoint (squash merge)
app.post('/api/approve', (req, res) => {
  const workingDirectory = process.env.TARGET_APP_PATH;
  if (!workingDirectory) {
    return res.status(400).json({ message: 'Missing required TARGET_APP_PATH environment variable.' });
  }

  try {
    const currentBranch = execSync('git branch --show-current', { cwd: workingDirectory }).toString().trim();
    if (currentBranch.startsWith('claude-feature-')) {
      execSync('git checkout main', { cwd: workingDirectory }); // Checkout main branch
      execSync(`git merge ${currentBranch} --squash`, { cwd: workingDirectory }); // Squash merge feature branch into main
      execSync('git commit -m "Merge claude-feature branch"', { cwd: workingDirectory }); // Commit the squash merge
      execSync(`git branch -D ${currentBranch}`, { cwd: workingDirectory }); // Delete the feature branch
      console.log(`✓ Approved and merged branch: ${currentBranch}`);
      res.json({ message: 'Approval successful' });
    } else {
      res.status(400).json({ message: 'Not on a claude-feature branch.' });
    }
  } catch (error) {
    console.error('Error approving changes:', error);
    res.status(500).json({ message: 'Failed to approve changes', error: error.message });
  }
});


// Endpoint to check current branch status and commit count
app.get('/api/branch-status', (req, res) => {
  const workingDirectory = process.env.TARGET_APP_PATH;
  if (!workingDirectory) {
    return res.status(400).json({ message: 'Missing required TARGET_APP_PATH environment variable.' });
  }

  try {
    const currentBranch = execSync('git branch --show-current', { cwd: workingDirectory }).toString().trim();
    const isFeatureBranch = currentBranch.startsWith('claude-feature-');

    let hasCommitsBeyondMain = false;
    if (isFeatureBranch) {
      const mainBranchHead = execSync('git rev-parse main', { cwd: workingDirectory }).toString().trim();
      const currentCommit = execSync('git rev-parse HEAD', { cwd: workingDirectory }).toString().trim();
      // Check if the current commit is different from the main branch HEAD
      hasCommitsBeyondMain = currentCommit !== mainBranchHead;
    }

    res.json({ hasCommitsBeyondMain });
  } catch (error) {
    console.error('Error checking branch status:', error);
    // If there's an error (e.g., not a git repository), assume not on a feature branch
    res.status(200).json({ hasCommitsBeyondMain: false });
  }
});


// Check Claude availability and initialize git repository before starting server
async function startServer() {
  checkClaudeCode();
  try {
    await initializeGitRepository(process.env.TARGET_APP_PATH);
    app.listen(3001, () => {
      console.log('Server is running on http://localhost:3001');
    });
  } catch (error) {
    console.error('Failed to initialize server:', error.message);
    process.exit(1);
  }
}

startServer();