# GEMINI Analysis Report

## Project Overview

This project (`projects/social-media`) is a sophisticated **Node.js-based automation engine** for end-to-end social media campaign management. It orchestrates the planning, content creation, visual generation, video production, and publishing of content across platforms like LinkedIn, Instagram, YouTube, and Facebook.

Its core strength lies in chaining multiple AI providers to produce complex media:
*   **Video:** Google Gemini (Veo 3.1) for scene extension, HeyGen for AI avatars, and Shotstack for compositing.
*   **Images:** DALL-E and Fal AI for visuals.
*   **Text/Scripting:** GPT-4 and Groq for strategy, scripts, and captions.

## Key Files & Structure

*   **`main.js`**: The central CLI entry point. All commands flow through here.
*   **`core/`**: Contains the `orchestrator.js` (workflow engine) and `state-manager.js` (persistence).
*   **`campaigns/`**: logic for specific campaign types (e.g., `linkedin-handler.js`, `instagram-handler.js`).
*   **`video/`** & **`image/`**: specialized modules for interacting with media generation APIs (Veo, HeyGen, Shotstack, Fal).
*   **`data/campaign-state.json`**: JSON-based database for tracking campaign progress and state.
*   **`test-*.js`**: standalone scripts for testing specific integrations (e.g., `test-video-providers.js`).

## Usage & workflows

### Setup
1.  **Install:** `npm install`
2.  **Configure:** Copy `.env.example` to `.env` and populate API keys (Gemini, HeyGen, Shotstack, etc.).
3.  **Initialize:** `npm run init` (creates state files).

### Core Commands
*   **Check Status:** `npm run status` (View active campaigns and queues).
*   **Run Campaign:** `node main.js campaign <type> --topic "<topic>" [options]`
    *   *Example:* `node main.js campaign linkedin-testimonial --topic "Success Story" --use-veo --use-avatar`
*   **Simulation:** Use `--simulate` flag to test logic without API costs.

### Testing
*   **Video Providers:** `node test-video-providers.js`
*   **Image Generation:** `node test-image-generation.js`
*   **Simulation Test:** `npm test`

## Development Guidelines

*   **Style:** CommonJS (`require`), 2-space indentation, CamelCase for functions.
*   **Architecture:** Keep orchestration pure; push API logic into `integrations/` or `video/` modules.
*   **Testing:** Create `test-<feature>.js` scripts for new integrations.
*   **State:** Persist all campaign data to `data/campaign-state.json` via the State Manager. Do not rely on runtime memory.
