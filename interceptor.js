#!/usr/bin/env node
// Trampoline wrapper to ensure hooks resolve whether called from root or subfolder
require('./.agents/interceptor.js');
