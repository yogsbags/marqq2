#!/bin/bash

# Start the Enhanced Bulk Generator Backend API Server
# This runs on port 3008 and handles workflow execution
# Vite (port 3007) proxies API calls to this server

cd "$(dirname "$0")/../platform/content-engine"
node backend-server.js

