const http = require('http');

const [,, cmd = 'npm run deploy:staging', action = 'Deploying staging preview', desc = 'Push build to staging server'] = process.argv;

const payload = {
  conversationId: 'phone-test-session',
  stepIdx: 1,
  workspacePaths: [process.cwd()],
  toolCall: {
    name: 'run_command',
    args: {
      CommandLine: cmd,
      toolAction: action,
      Description: desc,
    },
  },
};

console.log(`\n========================================`);
console.log(`📱 PUSHING APPROVAL REQUEST TO YOUR PHONE`);
console.log(`Action:      ${action}`);
console.log(`Command:     ${cmd}`);
console.log(`Description: ${desc}`);
console.log(`========================================`);
console.log(`Waiting for your tap on phone companion...`);

const startTime = Date.now();
const postData = JSON.stringify(payload);

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 4041,
    path: '/api/hook/pre-tool-use',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 120000,
  },
  res => {
    let body = '';
    res.on('data', chunk => (body += chunk));
    res.on('end', () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      try {
        const response = JSON.parse(body);
        console.log(`\n✅ Response received from phone (${elapsed}s):`);
        console.log(`Decision: ${response.decision.toUpperCase()}`);
        if (response.reason) console.log(`Reason:   ${response.reason}`);
      } catch (e) {
        console.log(`\nRaw response (${elapsed}s): ${body}`);
      }
    });
  }
);

req.on('timeout', () => {
  req.destroy();
  console.log(`\n⏱️ Request timed out after 120s.`);
});

req.on('error', err => {
  console.error(`\n❌ Error connecting to companion daemon on port 4041:`, err.message);
});

req.write(postData);
req.end();
