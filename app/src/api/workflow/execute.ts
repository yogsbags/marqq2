// API handler for workflow execution
// This will be called by the Enhanced Bulk Generator component

import { spawn } from 'child_process';
import path from 'path';

export async function executeWorkflow(options: {
  topicLimit: number;
  category: string;
  customTopic?: string;
  customTitle?: string;
  contentOutline?: string;
}) {
  const backendDir = path.join(process.cwd(), 'platform', 'content-engine', 'backend');
  const mainJsPath = path.join(backendDir, 'main.js');

  return new Promise((resolve, reject) => {
    const args = [
      mainJsPath,
      'full',
      '--auto-approve',
      '--topic-limit',
      options.topicLimit.toString(),
      '--category',
      options.category,
    ];

    if (options.customTopic) {
      args.push('--custom-topic', options.customTopic);
    }
    if (options.customTitle) {
      args.push('--custom-title', options.customTitle);
    }
    if (options.contentOutline) {
      args.push('--content-outline-provided');
    }

    const nodeEnv = {
      ...process.env,
      CONTENT_OUTLINE: options.contentOutline || '',
    };

    const nodeProcess = spawn('node', args, {
      cwd: backendDir,
      env: nodeEnv,
    });

    const output: string[] = [];
    const errorOutput: string[] = [];

    nodeProcess.stdout.on('data', (data: Buffer) => {
      output.push(data.toString());
    });

    nodeProcess.stderr.on('data', (data: Buffer) => {
      errorOutput.push(data.toString());
    });

    nodeProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output: output.join(''), errorOutput: errorOutput.join('') });
      } else {
        reject({ success: false, code, output: output.join(''), errorOutput: errorOutput.join('') });
      }
    });

    nodeProcess.on('error', (error) => {
      reject({ success: false, error: error.message });
    });
  });
}
