import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { HookIpcServer } from './ipc-server.js';
import { ApprovalRequest, ApprovalDecisionPayload } from '@agy-companion/protocol';

function makePostRequest(port: number, payload: any): Promise<{ statusCode?: number; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/hook/pre-tool-use',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

test('HookIpcServer approval lifecycle and single emission', async () => {
  const testPort = 4099;
  const server = new HookIpcServer(testPort);
  await server.start();

  try {
    let requestedFired: ApprovalRequest | null = null;
    let resolvedFired: ApprovalDecisionPayload[] = [];

    server.on('approval_requested', req => {
      requestedFired = req;
    });

    server.on('approval_resolved', payload => {
      resolvedFired.push(payload);
    });

    // 1. Send hook pre-tool-use request (simulating interceptor)
    const postPromise = makePostRequest(testPort, {
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'npm test' },
      },
      workspacePaths: [process.cwd()],
    });

    // Wait briefly for server to process and emit approval_requested
    await new Promise(r => setTimeout(r, 100));
    assert.ok(requestedFired, 'approval_requested should have been emitted');
    const reqId = (requestedFired as ApprovalRequest).id;
    assert.strictEqual((requestedFired as ApprovalRequest).toolCall?.args?.CommandLine, 'npm test');

    // 2. Resolve the approval with 'allow'
    const resolveResult = server.resolveApproval({
      requestId: reqId,
      decision: 'allow',
    });
    assert.strictEqual(resolveResult, true, 'First resolveApproval should return true');

    // 3. Await the HTTP response sent back to interceptor
    const res = await postPromise;
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.data.permissionOverrides?.includes('command(npm test)'));

    // 4. Verify approval_resolved was emitted exactly once (Finding 1)
    assert.strictEqual(resolvedFired.length, 1, 'approval_resolved should only fire once');
    assert.strictEqual(resolvedFired[0].requestId, reqId);
    assert.strictEqual(resolvedFired[0].decision, 'allow');

    // 5. Resolving the same request again should return false (Finding 9)
    const secondResolve = server.resolveApproval({
      requestId: reqId,
      decision: 'deny',
    });
    assert.strictEqual(secondResolve, false, 'Resolving non-existent or already resolved request should return false');
    assert.strictEqual(resolvedFired.length, 1, 'No additional approval_resolved should fire for stale ID');
  } finally {
    await server.stop();
  }
});
