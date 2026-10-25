package com.antigravity.companion;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;

import java.io.File;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static MainActivity instance;
    public static final int REQUEST_CODE_SPEECH_INPUT = 2002;

    public static MainActivity getInstance() {
        return instance;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        startPersistentCompanionService();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(this, "AndroidHost");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 1001);
            }
        }
    }

    @JavascriptInterface
    public void minimizeApp() {
        runOnUiThread(() -> moveTaskToBack(true));
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public void setKeepScreenOn(boolean keepOn) {
        runOnUiThread(() -> {
            try {
                if (keepOn) {
                    getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    @JavascriptInterface
    public void startVoiceInput() {
        runOnUiThread(() -> {
            try {
                getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak prompt for Antigravity...");
                startActivityForResult(intent, REQUEST_CODE_SPEECH_INPUT);
            } catch (Exception e) {
                getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                e.printStackTrace();
                notifyVoiceInputResult(null, e.getMessage());
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_SPEECH_INPUT) {
            getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (results != null && !results.isEmpty()) {
                    String spokenText = results.get(0);
                    notifyVoiceInputResult(spokenText, null);
                }
            }
        }
    }

    private void notifyVoiceInputResult(String text, String error) {
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                if (text != null) {
                    String safeText = text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
                    String js = "window.dispatchEvent(new CustomEvent('native_voice_result', { detail: { text: '" + safeText + "' } }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                } else if (error != null) {
                    String safeErr = error.replace("\\", "\\\\").replace("'", "\\'");
                    String js = "window.dispatchEvent(new CustomEvent('native_voice_error', { detail: { error: '" + safeErr + "' } }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            }
        });
    }

    @JavascriptInterface
    public void requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(android.content.Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    @JavascriptInterface
    public void updatePersistentNotification(String title, String content, String requestId, boolean isAlert, String subtext) {
        Intent intent = new Intent(this, CompanionForegroundService.class);
        intent.setAction(CompanionForegroundService.ACTION_UPDATE_STATUS);
        intent.putExtra("title", title);
        intent.putExtra("content", content);
        intent.putExtra("requestId", requestId);
        intent.putExtra("isAlert", isAlert);
        intent.putExtra("subtext", subtext);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    @JavascriptInterface
    public void updatePersistentNotification(String title, String content, String requestId, boolean isAlert) {
        updatePersistentNotification(title, content, requestId, isAlert, null);
    }

    @JavascriptInterface
    public void setActiveHost(String host, String port) {
        setActiveHost(host, port, null);
    }

    @JavascriptInterface
    public void setActiveHost(String host, String port, String token) {
        try {
            android.content.SharedPreferences.Editor editor = getSharedPreferences("kyber_companion", MODE_PRIVATE)
                .edit()
                .putString("active_host", host)
                .putString("active_port", port != null ? port : "4040");
            if (token != null && !token.trim().isEmpty()) {
                editor.putString("active_token", token.trim());
            }
            editor.apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void notifyApprovalResolved(String requestId, String decision) {
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String safeDecision = decision.replace("'", "\\'");
                String js = "window.dispatchEvent(new CustomEvent('approval_resolved_external', { detail: { requestId: '" + requestId + "', decision: '" + safeDecision + "' } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        });
    }

    @JavascriptInterface
    public void downloadAndInstallApk(String downloadUrl) {
        runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!getPackageManager().canRequestPackageInstalls()) {
                        try {
                            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            settingsIntent.setData(Uri.parse("package:" + getPackageName()));
                            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(settingsIntent);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                        notifyDownloadProgress(-1, "Enable 'Install unknown apps' permission to update");
                        return;
                    }
                }

                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) {
                    notifyDownloadProgress(-1, "DownloadManager service not available");
                    return;
                }

                File destinationDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (destinationDir == null) {
                    destinationDir = getFilesDir();
                }
                File targetApk = new File(destinationDir, "update.apk");
                if (targetApk.exists()) {
                    targetApk.delete();
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(downloadUrl));
                request.setTitle("Antigravity Companion Update");
                request.setDescription("Downloading latest build...");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "update.apk");
                request.setMimeType("application/vnd.android.package-archive");

                long downloadId = dm.enqueue(request);
                notifyDownloadProgress(10, "Download started in system manager...");

                // Monitor download progress in background thread
                new Thread(() -> {
                    boolean downloading = true;
                    while (downloading) {
                        DownloadManager.Query q = new DownloadManager.Query();
                        q.setFilterById(downloadId);
                        Cursor cursor = dm.query(q);
                        if (cursor != null && cursor.moveToFirst()) {
                            int bytesDownloadedCol = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                            int bytesTotalCol = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                            int statusCol = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);

                            long bytesDownloaded = bytesDownloadedCol != -1 ? cursor.getLong(bytesDownloadedCol) : 0;
                            long bytesTotal = bytesTotalCol != -1 ? cursor.getLong(bytesTotalCol) : -1;
                            int status = statusCol != -1 ? cursor.getInt(statusCol) : -1;

                            cursor.close();

                            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                                downloading = false;
                                notifyDownloadProgress(100, "Download complete. Launching installer...");
                                runOnUiThread(() -> launchApkInstaller(targetApk));
                                break;
                            } else if (status == DownloadManager.STATUS_FAILED) {
                                downloading = false;
                                notifyDownloadProgress(-1, "Download failed via system manager");
                                break;
                            } else if (bytesTotal > 0) {
                                int percent = (int) ((bytesDownloaded * 100) / bytesTotal);
                                notifyDownloadProgress(Math.min(99, Math.max(10, percent)), "Downloading APK (" + percent + "%)...");
                            }
                        } else if (cursor != null) {
                            cursor.close();
                        }

                        try {
                            Thread.sleep(400);
                        } catch (InterruptedException e) {
                            break;
                        }
                    }
                }).start();

            } catch (Exception e) {
                e.printStackTrace();
                notifyDownloadProgress(-1, "Failed to start download: " + e.getMessage());
            }
        });
    }

    private void launchApkInstaller(File apkFile) {
        runOnUiThread(() -> {
            try {
                Uri apkUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    apkFile
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
                notifyDownloadProgress(-1, "Failed to launch installer: " + e.getMessage());
            }
        });
    }

    private void notifyDownloadProgress(int percent, String status) {
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String safeStatus = status.replace("'", "\\'");
                String js = "window.dispatchEvent(new CustomEvent('apk_update_progress', { detail: { percent: " + percent + ", status: '" + safeStatus + "' } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                String js = "window.dispatchEvent(new CustomEvent('android_back_pressed'));";
                getBridge().getWebView().evaluateJavascript(js, null);
            } else {
                super.onBackPressed();
            }
        });
    }

    private void startPersistentCompanionService() {
        try {
            Intent serviceIntent = new Intent(this, CompanionForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
