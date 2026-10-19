---
name: mobile-ux
description: "Mobile companion & touch ergonomics: guidelines for mobile web, PWA, Android APK, lockscreen notifications, touch targets, haptic feedback, and battery-friendly dark interfaces."
---

# Mobile UX & Ergonomics Doctrine

When building or refining mobile apps, PWAs, or companion tools:

---

## 1. Thumb-Zone Architecture & Ergonomics
- **Reachability Rule:** 75% of smartphone usage is one-handed. Critical interactive elements (e.g. *Allow*, *Deny*, *Intercept*, *Send Prompt*) MUST reside in the lower half ("natural thumb zone").
- **Minimum Touch Target:** All clickable elements must have at least `44px x 44px` effective tap area (`padding: 12px-14px`). Never use tiny text links for primary actions.
- **Swipe & Gesture Support:** Bottom sheets should support drag-to-dismiss and touch gestures.

---

## 2. Notification & Alert Design
- **Actionable Lockscreen Notifications:** When Antigravity requests tool permission, notifications must provide direct inline actions:
  - `[Allow]` (primary, unblocks immediately)
  - `[Deny]` (danger, blocks tool)
  - `[Open & Intercept]` (brings up chat prompt modal)
- **Haptic Feedback:**
  - On Permission Gate arrival: Double pulse haptic (`navigator.vibrate([200, 100, 200])`).
  - On Button Tap: Single crisp light tap (`navigator.vibrate(40)`).

---

## 3. Real-Time Streaming Performance
- **Zero Layout Shifts:** Streaming agent tokens and terminal outputs must maintain a fixed viewport or smoothly auto-scroll without jumpy layout recalculations.
- **Battery & OLED Dark Optimization:** True dark slate backgrounds (`#0a0f1d`) reduce OLED battery consumption while remote coding.
