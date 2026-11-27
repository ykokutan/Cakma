package com.cakma.app;

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

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class VoiceForegroundService extends Service {
    public static final String CHANNEL_ID = "cakma_voice_channel";
    public static final int NOTIFICATION_ID = 4101;
    public static final String EXTRA_ROOM_NAME = "roomName";
    public static final String EXTRA_USERNAME = "username";
    public static final String EXTRA_MUTED = "muted";

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        String roomName = intent != null ? intent.getStringExtra(EXTRA_ROOM_NAME) : "Ses Odası";
        String username = intent != null ? intent.getStringExtra(EXTRA_USERNAME) : "Çakma";
        boolean muted = intent != null && intent.getBooleanExtra(EXTRA_MUTED, false);

        if (roomName == null || roomName.isEmpty()) roomName = "Ses Odası";
        if (username == null || username.isEmpty()) username = "Çakma";

        acquireWakeLock();
        Notification notification = buildNotification(roomName, username, muted);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                serviceTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            }
            startForeground(NOTIFICATION_ID, notification, serviceTypes);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_STICKY;
    }

    private Notification buildNotification(String roomName, String username, boolean muted) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags);

        String statusText = muted
                ? username + " · Mikrofon susturuldu"
                : username + " · Arka plan sesli iletişim aktif";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🔊 " + roomName)
                .setContentText(statusText)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setContentIntent(contentIntent)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Çakma Sesli Görüşme",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Ses odasında arka planda mikrofon ve ses akışını açık tutar.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Cakma::VoiceCallWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            }
        } catch (Throwable ignored) {
        }
    }

    private void stopForegroundCompat() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Throwable ignored) {
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    @Override
    public void onDestroy() {
        stopForegroundCompat();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
