import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { WorkspaceManager } from './workspace-manager.js';
import { IdeTranscriptWatcher } from './ide-watcher.js';

test('WorkspaceManager rejects internal bin and CLI dist folders', () => {
  const wm = new WorkspaceManager();
  
  // Try registering an internal bin directory
  const binPath = 'D:\\CODE\\antigravity compainion\\packages\\cli\\dist\\bin';
  wm.registerWorkspace(binPath);
  
  // It should NOT be in listWorkspaces()
  const list = wm.listWorkspaces();
  assert.equal(list.length, 0, 'Internal bin path should not be added to active workspaces');
  
  // Register a legitimate workspace
  const legitPath = 'D:\\CODE\\FIRE TV';
  const legitWs = wm.registerWorkspace(legitPath);
  assert.equal(wm.listWorkspaces().length, 1);
  assert.equal(wm.listWorkspaces()[0].id, legitWs.id);
  assert.equal(wm.listWorkspaces()[0].name, 'FIRE TV');
});

test('IdeTranscriptWatcher getConversationIdsForWorkspace handles unknown and known workspaces', () => {
  const watcher = new IdeTranscriptWatcher();
  
  // Unknown workspace returns empty Set
  const unknownIds = watcher.getConversationIdsForWorkspace('d:/NonExistentPath/9999');
  assert.equal(unknownIds.size, 0);
  
  // Known workspace 'antigravity compainion'
  const companionIds = watcher.getConversationIdsForWorkspace('d:/CODE/antigravity compainion');
  assert.ok(companionIds.size > 0, 'Should find conversation IDs recorded in workspaceStorage for antigravity compainion');

  // Verify autoDiscoverActiveConversation finds the active conversation for antigravity companion
  const activePath = watcher.autoDiscoverActiveConversation('d:/CODE/antigravity compainion');
  assert.ok(activePath, 'Should discover active transcript for antigravity compainion');
  const activeId = watcher.getActiveConversationId();
  assert.ok(activeId, 'Should have active conversation ID');
  
  watcher.stop();
});
