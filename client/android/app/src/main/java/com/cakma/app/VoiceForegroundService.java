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
    public static final String EXTRA_DEAFENED = "deafened";

    public static final String ACTION_TOGGLE_MUTE = "com.cakma.app.ACTION_TOGGLE_MUTE";
    public static final String ACTION_TOGGLE_DEAFEN = "com.cakma.app.ACTION_TOGGLE_DEAFEN";
    public static final String ACTION_LEAVE_VOICE = "com.cakma.app.ACTION_LEAVE_VOICE";

    public interface ActionListener {
        void onVoiceNotificationAction(String action);
    }

    private static volatile ActionListener actionListener;

    public static void setActionListener(@Nullable ActionListener listener) {
        actionListener = listener;
    }

    private PowerManager.WakeLock wakeLock;
    private String lastRoomName = "Ses Odası";
    private String lastUsername = "Çakma";
    private boolean lastMuted = false;
    private boolean lastDeafened = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if ("STOP".equals(action)) {
            stopForegroundCompat();
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_TOGGLE_MUTE.equals(action) || ACTION_TOGGLE_DEAFEN.equals(action) || ACTION_LEAVE_VOICE.equals(action)) {
            ActionListener listener = actionListener;
            if (listener != null) {
                listener.onVoiceNotificationAction(action);
            }
            if (ACTION_LEAVE_VOICE.equals(action)) {
                stopForegroundCompat();
                stopSelf();
                return START_NOT_STICKY;
            }
            if (ACTION_TOGGLE_MUTE.equals(action)) {
                lastMuted = !lastMuted;
            } else if (ACTION_TOGGLE_DEAFEN.equals(action)) {
                lastDeafened = !lastDeafened;
            }
            Notification updated = buildNotification(lastRoomName, lastUsername, lastMuted, lastDeafened);
            startForegroundWithTypes(updated);
            return START_STICKY;
        }

        if (intent != null) {
            String incomingRoom = intent.getStringExtra(EXTRA_ROOM_NAME);
            String incomingUser = intent.getStringExtra(EXTRA_USERNAME);
            if (incomingRoom != null && !incomingRoom.isEmpty()) lastRoomName = incomingRoom;
            if (incomingUser != null && !incomingUser.isEmpty()) lastUsername = incomingUser;
            lastMuted = intent.getBooleanExtra(EXTRA_MUTED, false);
            lastDeafened = intent.getBooleanExtra(EXTRA_DEAFENED, false);
        }

        acquireWakeLock();
        Notification notification = buildNotification(lastRoomName, lastUsername, lastMuted, lastDeafened);
        startForegroundWithTypes(notification);

        return START_STICKY;
    }

    private void startForegroundWithTypes(Notification notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                serviceTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            }
            startForeground(NOTIFICATION_ID, notification, serviceTypes);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent createActionPendingIntent(String action, int requestCode) {
        Intent actionIntent = new Intent(this, VoiceForegroundService.class);
        actionIntent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, actionIntent, flags);
    }

    private Notification buildNotification(String roomName, String username, boolean muted, boolean deafened) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, launchIntent, pendingFlags);

        String statusText;
        if (deafened) {
            statusText = username + " · Kulaklık ve mikrofon kapalı";
        } else if (muted) {
            statusText = username + " · Mikrofon susturuldu";
        } else {
            statusText = username + " · Arka plan sesli iletişim aktif";
        }

        PendingIntent mutePi = createActionPendingIntent(ACTION_TOGGLE_MUTE, 101);
        PendingIntent deafenPi = createActionPendingIntent(ACTION_TOGGLE_DEAFEN, 102);
        PendingIntent leavePi = createActionPendingIntent(ACTION_LEAVE_VOICE, 103);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🔊 " + roomName)
                .setContentText(statusText)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setContentIntent(contentIntent)
                .addAction(0, muted ? "Sesi Aç" : "Sustur", mutePi)
                .addAction(0, deafened ? "Kulaklık Aç" : "Sağırlaştır", deafenPi)
                .addAction(0, "Ayrıl", leavePi)
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
