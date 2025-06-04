# Claude Server

Express server that receives annotated screenshots and sends them to Claude CLI for code analysis and modifications.

## Setup

```bash
npm install
npm start
```

Runs on http://localhost:3000

## Prerequisites

- [Claude CLI](https://claude.ai/cli) installed and configured
- Claude CLI must be available in PATH

## API

### POST /api/data

Receives annotated screenshots and forwards them to Claude.

Example usage:

**Request:**
```json
{
  "message": "The page is http://localhost:5173: Make the buttons bigger",
  "screenshot": "data:image/png;base64,..."
}
```

**Response:**
```json
{
  "message": "Screenshot processed by Claude successfully"
}
```

## How It Works

1. Receives screenshot and message from annotator
2. Saves screenshot to `screenshots/` directory
3. Calls Claude CLI with prompt and screenshot path
4. Claude analyzes image and modifies code files directly
5. Returns success/failure response

## Configuration

- Screenshots saved to: `./screenshots/`
- Working directory for Claude (hardcoded): `../test-app/`
- CORS enabled for all origins
- JSON payload limit: 50MB