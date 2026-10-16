package com.clovermail.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that keeps the app process (and the nodejs-mobile engine)
 * alive while the app is in the background, so Clover Mail keeps syncing and can
 * post notifications. Android requires the ongoing notification; it's started /
 * stopped from the app's "Stay connected" setting.
 */
public class KeepAliveService extends Service {
    private static final String CHANNEL_ID = "clover_keepalive";
    private static final int NOTIFICATION_ID = 1;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Clover Mail connection",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Keeps Clover Mail connected for new mail.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Clover Mail")
                .setContentText("Staying connected for new mail")
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
        startForeground(NOTIFICATION_ID, notification);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
