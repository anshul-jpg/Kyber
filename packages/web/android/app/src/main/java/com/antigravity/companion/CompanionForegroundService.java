package com.antigravity.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

import android.content.SharedPreferences;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

public class CompanionForegroundService extends Service {
    public static final String CHANNEL_ID = "antigravity_companion_channel_v3";
    public static final int NOTIFICATION_ID = 9001;
    public static final String ACTION_UPDATE_STATUS = "com.antigravity.companion.UPDATE_STATUS";
    public static final String ACTION_DECISION = "com.antigravity.companion.DECISION";

    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
        acquireWakeLock();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_DECISION.equals(action)) {
                String decision = intent.getStringExtra("decision");
                String requestId = intent.getStringExtra("requestId");
                if (decision != null && requestId != null) {
                    resolveDecision(requestId, decision);
                    updateNotification(
                        "Antigravity IDE",
                        "Approval " + decision.toUpperCase() + " — Processing...",
                        null,
                        false
                    );
                }
                return START_STICKY;
            } else if (ACTION_UPDATE_STATUS.equals(action)) {
                String title = intent.getStringExtra("title");
                String content = intent.getStringExtra("content");
                String requestId = intent.getStringExtra("requestId");
                boolean isAlert = intent.getBooleanExtra("isAlert", false);
                String subtext = intent.getStringExtra("subtext");
                updateNotification(
                    title != null ? title : "Antigravity IDE",
                    content != null ? content : "Remote Active — Ready",
                    requestId,
                    isAlert,
                    subtext != null ? subtext : "Remote Active"
                );
                return START_STICKY;
            }
        }

        // Default initial boot notification
        updateNotification(
            "Antigravity Companion",
            "Remote Active — Ready",
            null,
            false
        );

        return START_STICKY;
    }

    public static String sanitizeNotificationText(String raw) {
        if (raw == null) return "";
        return raw
            .replaceAll("\\[([^\\]]+)\\]\\([^)]+\\)", "$1")
            .replaceAll("file:///[^\\s)]+", "")
            .replaceAll("(?m)^#{1,6}\\s*", "")
            .replaceAll("[*_]{1,3}([^*_]+)[*_]{1,3}", "$1")
            .replaceAll("`([^`]+)`", "$1")
            .replaceAll("```[\\s\\S]*?```", "[Code snippet]")
            .replaceAll("(?m)^[\\s]*[>*-+]\\s*", "")
            .replaceAll("(?m)^[\\s]*\\d+\\.\\s*", "")
            .replaceAll("[\\r\\n]+", " ")
            .replaceAll("\\s{2,}", " ")
            .trim();
    }

    private void updateNotification(String title, String content, String approvalRequestId, boolean isAlert) {
        updateNotification(title, content, approvalRequestId, isAlert, null);
    }

    private void updateNotification(String title, String content, String approvalRequestId, boolean isAlert, String subtext) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        String cleanTitle = sanitizeNotificationText(title);
        String cleanContent = sanitizeNotificationText(content);
        if (cleanContent.length() > 220) {
            cleanContent = cleanContent.substring(0, 220) + "...";
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(cleanTitle)
            .setContentText(cleanContent)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(cleanContent))
            .setSubText(subtext != null ? subtext : "Remote Active")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(!isAlert);

        boolean hasApproval = approvalRequestId != null && !approvalRequestId.isEmpty();

        if (isAlert || hasApproval) {
            builder.setPriority(NotificationCompat.PRIORITY_HIGH);
            builder.setSilent(false);
            builder.setDefaults(Notification.DEFAULT_ALL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(NotificationCompat.CATEGORY_CALL);
            }
        } else {
            builder.setPriority(NotificationCompat.PRIORITY_LOW);
            builder.setSilent(true);
        }

        if (hasApproval) {
            // Allow action button
            Intent allowIntent = new Intent(this, CompanionForegroundService.class);
            allowIntent.setAction(ACTION_DECISION);
            allowIntent.putExtra("decision", "allow");
            allowIntent.putExtra("requestId", approvalRequestId);
            PendingIntent allowPending = PendingIntent.getService(
                this,
                101,
                allowIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );
            builder.addAction(new NotificationCompat.Action.Builder(0, "Allow", allowPending).build());

            // Deny action button
            Intent denyIntent = new Intent(this, CompanionForegroundService.class);
            denyIntent.setAction(ACTION_DECISION);
            denyIntent.putExtra("decision", "deny");
            denyIntent.putExtra("requestId", approvalRequestId);
            PendingIntent denyPending = PendingIntent.getService(
                this,
                102,
                denyIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );
            builder.addAction(new NotificationCompat.Action.Builder(0, "Deny", denyPending).build());
        }

        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (notificationManager != null) {
            notificationManager.notify(NOTIFICATION_ID, notification);
        }
    }

    private void resolveDecision(String requestId, String decision) {
        new Thread(() -> {
            List<String> endpoints = new ArrayList<>();
            try {
                SharedPreferences prefs = getSharedPreferences("kyber_companion", MODE_PRIVATE);
                String savedHost = prefs.getString("active_host", null);
                String savedPort = prefs.getString("active_port", "4040");
                String savedToken = prefs.getString("active_token", null);
                if (savedHost != null && !savedHost.trim().isEmpty()) {
                    String clean = savedHost.trim();
                    if (clean.startsWith("http://") || clean.startsWith("https://")) {
                        endpoints.add(clean.replaceAll("/$", "") + "/api/hook/approval");
                    } else {
                        endpoints.add("http://" + clean + ":" + savedPort + "/api/hook/approval");
                    }
                }
            } catch (Exception ignored) {}

            endpoints.add("http://127.0.0.1:4040/api/hook/approval");
            endpoints.add("http://127.0.0.1:4041/api/hook/approval");

            for (String ep : endpoints) {
                try {
                    URL url = new URL(ep);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(3000);
                    conn.setReadTimeout(5000);
                    conn.setRequestProperty("Content-Type", "application/json");
                    try {
                        SharedPreferences p = getSharedPreferences("kyber_companion", MODE_PRIVATE);
                        String token = p.getString("active_token", null);
                        if (token != null && !token.trim().isEmpty()) {
                            conn.setRequestProperty("Authorization", "Bearer " + token.trim());
                        }
                    } catch (Exception ignored) {}
                    conn.setDoOutput(true);

                    String json = "{\"requestId\":\"" + requestId + "\",\"decision\":\"" + decision + "\"}";
                    OutputStream os = conn.getOutputStream();
                    os.write(json.getBytes("UTF-8"));
                    os.close();

                    int code = conn.getResponseCode();
                    if (code == 200) {
                        break;
                    }
                } catch (Exception ignored) {}
            }
        }).start();

        // Also notify MainActivity if running
        MainActivity mainActivity = MainActivity.getInstance();
        if (mainActivity != null) {
            mainActivity.notifyApprovalResolved(requestId, decision);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Antigravity Companion Service",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Maintains single persistent notification for remote approvals & agent status");
            channel.enableVibration(true);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void acquireWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "AntigravityCompanion::KeepAliveWakeLock"
                );
                wakeLock.acquire();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
