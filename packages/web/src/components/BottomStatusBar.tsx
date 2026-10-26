import React from 'react';
import { Radio, Bell } from 'lucide-react';
import { CompanionMode } from '@agy-companion/protocol';
import { triggerHaptic } from './CommonUI';
import { requestNotificationPermission } from '../utils/notifications';

interface BottomStatusBarProps {
  companionMode: CompanionMode;
  onToggleMode: (mode: CompanionMode) => void;
  onOpenSettings: () => void;
}

export const BottomStatusBar: React.FC<BottomStatusBarProps> = ({
  companionMode,
  onToggleMode,
  onOpenSettings,
}) => {
  const isRemote = companionMode === 'remote' || companionMode === 'autonomous';

  const handleToggle = () => {
    triggerHaptic(25);
    onToggleMode(isRemote ? 'desk' : 'remote');
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(26px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: '#121213',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
        fontSize: '11px',
        color: '#858585',
        zIndex: 40,
      }}
    >
      {/* Left: Go Live */}
      <div
        onClick={handleToggle}
        style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
      >
        <Radio size={12} color={isRemote ? '#ffffff' : '#858585'} />
        <span
          style={{
            color: isRemote ? '#ffffff' : '#858585',
            fontWeight: isRemote ? 600 : 400,
          }}
        >
          {isRemote ? 'Go Live (Remote)' : 'Go Live (Desk)'}
        </span>
      </div>

      {/* Center: Antigravity - Settings */}
      <div
        onClick={() => {
          onOpenSettings();
          triggerHaptic(20);
        }}
        style={{ cursor: 'pointer' }}
      >
        Antigravity - Settings
      </div>

      {/* Right: Notifications Bell */}
      <div
        onClick={() => {
          requestNotificationPermission();
          triggerHaptic(25);
        }}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        <Bell size={12} />
      </div>
    </div>
  );
};
