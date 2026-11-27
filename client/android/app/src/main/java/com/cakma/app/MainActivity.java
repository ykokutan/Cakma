package com.cakma.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
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

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 4201;
    private volatile String lastRoomName = "Ses Odası";
    private volatile String lastUsername = "Çakma";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestVoicePermissionsIfNeeded();
        configureWebViewForWebRtc();
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

    private class CakmaAndroidBridge {
        @JavascriptInterface
        public void startVoiceService(String roomName, String username) {
            lastRoomName = (roomName != null && !roomName.isEmpty()) ? roomName : "Ses Odası";
            lastUsername = (username != null && !username.isEmpty()) ? username : "Çakma";
            Intent intent = new Intent(MainActivity.this, VoiceForegroundService.class);
            intent.putExtra(VoiceForegroundService.EXTRA_ROOM_NAME, lastRoomName);
            intent.putExtra(VoiceForegroundService.EXTRA_USERNAME, lastUsername);
            intent.putExtra(VoiceForegroundService.EXTRA_MUTED, false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        }

        @JavascriptInterface
        public void updateMuteState(boolean muted) {
            Intent intent = new Intent(MainActivity.this, VoiceForegroundService.class);
            intent.putExtra(VoiceForegroundService.EXTRA_ROOM_NAME, lastRoomName);
            intent.putExtra(VoiceForegroundService.EXTRA_USERNAME, lastUsername);
            intent.putExtra(VoiceForegroundService.EXTRA_MUTED, muted);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        }

        @JavascriptInterface
        public void stopVoiceService() {
            Intent intent = new Intent(MainActivity.this, VoiceForegroundService.class);
            intent.setAction("STOP");
            startService(intent);
        }
    }
}
