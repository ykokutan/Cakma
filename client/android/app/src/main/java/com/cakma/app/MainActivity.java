package com.cakma.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.HapticFeedbackConstants;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity implements VoiceForegroundService.ActionListener {
    private static final int PERMISSION_REQUEST_CODE = 4201;
    private volatile String lastRoomName = "Ses Odası";
    private volatile String lastUsername = "Çakma";
    private volatile boolean lastMuted = false;
    private volatile boolean lastDeafened = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        VoiceForegroundService.setActionListener(this);
        requestVoicePermissionsIfNeeded();
        configureWebViewForWebRtc();
    }

    @Override
    public void onDestroy() {
        VoiceForegroundService.setActionListener(null);
        super.onDestroy();
    }

    @Override
    public void onVoiceNotificationAction(String action) {
        if (action == null) return;
        final String safeAction = action.replaceAll("[^a-zA-Z0-9_.-]", "");
        runOnUiThread(() -> {
            try {
                if (this.bridge == null || this.bridge.getWebView() == null) return;
                String js = "window.dispatchEvent(new CustomEvent('cakma:android-voice-action',{detail:'" + safeAction + "'}));";
                this.bridge.getWebView().evaluateJavascript(js, null);
            } catch (Throwable ignored) {
            }
        });
    }

    private void requestVoicePermissionsIfNeeded() {
        List<String> needed = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private void configureWebViewForWebRtc() {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new CakmaAndroidBridge(), "CakmaAndroidBridge");
        webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    try {
                        request.grant(request.getResources());
                    } catch (Throwable ignored) {
                    }
                });
            }
        });
    }

    private void pushVoiceStateToService() {
        Intent intent = new Intent(MainActivity.this, VoiceForegroundService.class);
        intent.putExtra(VoiceForegroundService.EXTRA_ROOM_NAME, lastRoomName);
        intent.putExtra(VoiceForegroundService.EXTRA_USERNAME, lastUsername);
        intent.putExtra(VoiceForegroundService.EXTRA_MUTED, lastMuted);
        intent.putExtra(VoiceForegroundService.EXTRA_DEAFENED, lastDeafened);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private class CakmaAndroidBridge {
        @JavascriptInterface
        public void startVoiceService(String roomName, String username) {
            lastRoomName = (roomName != null && !roomName.isEmpty()) ? roomName : "Ses Odası";
            lastUsername = (username != null && !username.isEmpty()) ? username : "Çakma";
            pushVoiceStateToService();
        }

        @JavascriptInterface
        public void updateMuteState(boolean muted) {
            lastMuted = muted;
            pushVoiceStateToService();
        }

        @JavascriptInterface
        public void updateVoiceState(boolean muted, boolean deafened) {
            lastMuted = muted;
            lastDeafened = deafened;
            pushVoiceStateToService();
        }

        @JavascriptInterface
        public void stopVoiceService() {
            Intent intent = new Intent(MainActivity.this, VoiceForegroundService.class);
            intent.setAction("STOP");
            startService(intent);
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return info != null && info.versionName != null ? info.versionName : "1.5.0";
            } catch (Throwable ignored) {
                return "1.5.0";
            }
        }

        @JavascriptInterface
        public void triggerHaptic(String style) {
            runOnUiThread(() -> {
                try {
                    if (MainActivity.this.bridge == null || MainActivity.this.bridge.getWebView() == null) return;
                    int feedback = "heavy".equals(style)
                            ? HapticFeedbackConstants.LONG_PRESS
                            : HapticFeedbackConstants.VIRTUAL_KEY;
                    MainActivity.this.bridge.getWebView().performHapticFeedback(feedback);
                } catch (Throwable ignored) {
                }
            });
        }
    }
}
