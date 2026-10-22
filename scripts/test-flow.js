/**
 * Antigravity Companion - Automated End-to-End Pipeline Harness
 * Verifies:
 * 1. Mobile Client connects to Daemon over WebSocket.
 * 2. Extension Host connects to Daemon as session controller.
 * 3. Mobile Client sends 'client:send_prompt'.
 * 4. Daemon broadcasts user bubble to mobile client.
 * 5. Daemon forwards prompt directly to Extension Host via 'server:forward_prompt'.
 */
const WebSocket = require('ws');

const DAEMON_PORT = 4040;
const TEST_PROMPT = `[Harness Test ${Date.now()}] Testing inverted Layer 4 architecture`;

async function runTest() {
  console.log('🧪 Starting Antigravity Companion Pipeline Verification...\n');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('❌ Test timed out after 5000ms'));
    }, 5000);

    let mobileBubbleReceived = false;
    let extensionForwardReceived = false;

    // 1. Connect Extension Host client
    const extWs = new WebSocket(`ws://127.0.0.1:${DAEMON_PORT}`);
    let phoneWs = null;

    extWs.on('open', () => {
      console.log('  1. Extension Host client connected to daemon.');
      extWs.send(
        JSON.stringify({
          type: 'client:hello',
          deviceId: 'vscode_extension_host',
          name: 'VS Code Extension Host Mock',
        })
      );

      // 2. Connect Mobile Phone client after extension is attached
      setTimeout(() => {
        phoneWs = new WebSocket(`ws://127.0.0.1:${DAEMON_PORT}`);

        phoneWs.on('open', () => {
          console.log('  2. Mobile Phone client connected to daemon.');
          phoneWs.send(
            JSON.stringify({
              type: 'client:hello',
              deviceId: 'simulated_phone_device',
              name: 'Pixel 8 Pro (Simulated)',
            })
          );

          // 3. Send test prompt from Phone
          setTimeout(() => {
            console.log(`  3. Phone sending prompt: "${TEST_PROMPT}"`);
            phoneWs.send(
              JSON.stringify({
                type: 'client:send_prompt',
                prompt: TEST_PROMPT,
                workspaceId: 'default',
              })
            );
          }, 300);
        });

        phoneWs.on('message', data => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'server:chat_message' && msg.message?.content === TEST_PROMPT) {
              console.log('  4. ✅ Mobile received optimistic chat bubble broadcast.');
              mobileBubbleReceived = true;
              checkDone();
            }
          } catch {}
        });

        phoneWs.on('error', err => {
          console.error('Phone WS error:', err.message);
        });
      }, 300);
    });

    extWs.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'server:forward_prompt' && msg.prompt === TEST_PROMPT) {
          console.log('  5. ✅ Extension Host received "server:forward_prompt" directly over WebSocket!');
          extensionForwardReceived = true;
          checkDone();
        }
      } catch {}
    });

    extWs.on('error', err => {
      console.error('Extension WS error:', err.message);
    });

    function checkDone() {
      if (mobileBubbleReceived && extensionForwardReceived) {
        clearTimeout(timeout);
        try { phoneWs?.close(); } catch {}
        try { extWs.close(); } catch {}
        resolve();
      }
    }
  });
}

runTest()
  .then(() => {
    console.log('\n======================================================');
    console.log('🎉 PIPELINE VERIFIED: 100% deterministic, 0 guessing.');
    console.log('======================================================\n');
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n❌ VERIFICATION FAILED: ${err.message}\n`);
    process.exit(1);
  });
