package com.unsunsk8er.biu;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.LruCache;
import android.widget.RemoteViews;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import org.json.JSONObject;

import android.graphics.drawable.Icon;

/**
 * Foreground media service.
 *
 * A MediaSession owned by an Activity is not enough for Android/鸿蒙通知栏
 * media controls once the Activity is paused. Hosting the session and the
 * MediaStyle notification in a mediaPlayback foreground service keeps the
 * notification alive and lets the system media card discover the session.
 */
public class PlaybackNotificationService extends Service {
    private static final String EXTRA_PAYLOAD = "payload";

    private MediaSessionController controller;
    private PowerManager.WakeLock playbackWakeLock;
    private AudioManager audioManager;
    private AudioManager.OnModeChangedListener modeChangedListener;
    private final Handler callModeHandler = new Handler(Looper.getMainLooper());
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> coverCache = new LruCache<>(8);
    private final Set<String> coverLoads = Collections.synchronizedSet(new HashSet<>());
    private volatile String latestPayload = "";
    private volatile String latestTitle = "biu";
    private volatile String latestArtist = "正在播放";
    private volatile String latestCoverUrl = "";
    private boolean callPauseSent;
    private final Runnable callModePoll = new Runnable() {
        @Override
        public void run() {
            if (audioManager != null) handleCallAudioMode(audioManager.getMode());
            callModeHandler.postDelayed(this, 1000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            controller = new MediaSessionController(this, command -> {
                Intent intent = new Intent(MediaSessionController.ACTION_MEDIA_COMMAND)
                    .setPackage(getPackageName())
                    .putExtra("command", command);
                sendBroadcast(intent);
            });
        } catch (Throwable error) {
            // Some compatibility containers do not implement MediaSession.
            // Keep the foreground service/notification alive without controls.
            controller = null;
        }
        try {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                playbackWakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "biu:Playback"
                );
                playbackWakeLock.setReferenceCounted(false);
            }
        } catch (Throwable ignored) {
            playbackWakeLock = null;
        }
        try {
            audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (audioManager != null) {
                boolean observing = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        modeChangedListener = this::handleCallAudioMode;
                        audioManager.addOnModeChangedListener(getMainExecutor(), modeChangedListener);
                        observing = true;
                    } catch (Throwable ignored) {
                        modeChangedListener = null;
                    }
                }
                if (!observing) callModeHandler.post(callModePoll);
                // The service can start while a call is already connected.
                handleCallAudioMode(audioManager.getMode());
            }
        } catch (Throwable ignored) {
            audioManager = null;
        }
    }

    /**
     * Detect an active cellular/VoIP call through the system audio mode. This
     * avoids requesting READ_PHONE_STATE and does not fight WebView's own audio
     * focus client. Pause once per call; never auto-resume after the call.
     */
    private void handleCallAudioMode(int mode) {
        boolean inCall = mode == AudioManager.MODE_IN_CALL
            || mode == AudioManager.MODE_IN_COMMUNICATION;
        if (inCall) {
            if (!callPauseSent) {
                callPauseSent = true;
                sendMediaCommand("pause");
            }
        } else {
            callPauseSent = false;
        }
    }

    private void sendMediaCommand(String command) {
        try {
            Intent intent = new Intent(MediaSessionController.ACTION_MEDIA_COMMAND)
                .setPackage(getPackageName())
                .putExtra("command", command);
            sendBroadcast(intent);
        } catch (Throwable ignored) {
            // The Activity may be gone; there is nothing to pause then.
        }
    }

    private void setPlaybackWakeLock(boolean playing) {
        if (playbackWakeLock == null) return;
        try {
            if (playing) {
                if (!playbackWakeLock.isHeld()) playbackWakeLock.acquire();
            } else if (playbackWakeLock.isHeld()) {
                playbackWakeLock.release();
            }
        } catch (Throwable ignored) {
            // Some Android containers deny wake locks; playback should still work.
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String payload = intent == null ? null : intent.getStringExtra(EXTRA_PAYLOAD);
        if (payload == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        boolean hasTrack = false;
        boolean isPlaying = false;
        boolean loading = false;
        String title = "biu";
        String artist = "正在播放";
        String coverUrl = "";
        try {
            JSONObject data = new JSONObject(payload);
            hasTrack = data.optBoolean("hasTrack", false);
            isPlaying = data.optBoolean("isPlaying", false);
            loading = data.optBoolean("loading", false);
            title = data.optString("title", title);
            artist = data.optString("artist", artist);
            coverUrl = data.optString("coverUrl", "");
        } catch (Exception ignored) {
        }
        latestPayload = payload;
        latestTitle = title;
        latestArtist = artist;
        latestCoverUrl = coverUrl;

        if (!hasTrack) {
            setPlaybackWakeLock(false);
            if (controller != null) controller.updateSession(payload);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        try {
            if (controller != null) controller.updateSession(payload);
            startForeground(
                MediaSessionController.NOTIFICATION_ID,
                buildNotification(payload, title, artist, coverUrl)
            );
            setPlaybackWakeLock(isPlaying || loading);
            if (!coverUrl.isEmpty() && coverCache.get(coverUrl) == null) {
                loadCoverAsync(coverUrl);
            }
        } catch (Throwable error) {
            // Notification permission/channel may be unavailable in some
            // compatibility containers; keep the media session usable.
            setPlaybackWakeLock(false);
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    private Notification buildNotification(String payload, String title, String artist, String coverUrl) {
        boolean isPlaying = false;
        try {
            JSONObject data = new JSONObject(payload);
            isPlaying = data.optBoolean("isPlaying", false);
        } catch (Exception ignored) {
        }
        Bitmap cover = coverCache.get(coverUrl);

        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = PendingIntent.getActivity(this, 0, open, pendingFlags);

        RemoteViews views = new RemoteViews(getPackageName(), R.layout.notification_media);
        views.setTextViewText(R.id.notification_title, title);
        views.setTextViewText(R.id.notification_artist, artist);
        views.setTextViewText(R.id.notification_play, isPlaying ? "暂停" : "播放");
        if (cover != null) {
            views.setImageViewBitmap(R.id.notification_cover, cover);
        } else {
            views.setImageViewResource(R.id.notification_cover, R.drawable.ic_launcher);
        }
        views.setOnClickPendingIntent(R.id.notification_prev, commandPending("prev", 1));
        views.setOnClickPendingIntent(R.id.notification_play, commandPending("play-pause", 2));
        views.setOnClickPendingIntent(R.id.notification_next, commandPending("next", 3));

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, MediaSessionController.CHANNEL_ID)
            : new Notification.Builder(this);
        builder
            .setSmallIcon(R.drawable.ic_stat_biu)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(contentIntent)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(true)
            .setCustomContentView(views)
            .setCustomBigContentView(views);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            builder.setLargeIcon(cover != null
                ? Icon.createWithBitmap(cover)
                : Icon.createWithResource(this, R.drawable.ic_launcher));
        }

        builder.addAction(notificationAction("上一首", android.R.drawable.ic_media_previous, "prev", 1));
        builder.addAction(notificationAction(
            isPlaying ? "暂停" : "播放",
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            "play-pause",
            2
        ));
        builder.addAction(notificationAction("下一首", android.R.drawable.ic_media_next, "next", 3));

        if (controller != null) {
            Notification.MediaStyle style = new Notification.MediaStyle()
                .setMediaSession(controller.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(style);
        }
        return builder.build();
    }

    private Notification.Action notificationAction(String title, int iconRes, String command, int requestCode) {
        return new Notification.Action.Builder(
            Icon.createWithResource(this, iconRes),
            title,
            commandPending(command, requestCode)
        ).build();
    }

    private PendingIntent commandPending(String command, int requestCode) {
        Intent intent = new Intent(MediaSessionController.ACTION_MEDIA_COMMAND)
            .setPackage(getPackageName())
            .putExtra("command", command);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(this, requestCode, intent, flags);
    }

    private void loadCoverAsync(String coverUrl) {
        if (coverUrl == null || coverUrl.isEmpty()) return;
        if (coverCache.get(coverUrl) != null) return;
        if (!coverLoads.add(coverUrl)) return;
        new Thread(() -> {
            Bitmap bitmap = null;
            try {
                bitmap = fetchCover(coverUrl);
                if (bitmap != null) coverCache.put(coverUrl, bitmap);
            } catch (Throwable ignored) {
                // A broken cover must never affect the notification/player.
            } finally {
                coverLoads.remove(coverUrl);
            }
            if (bitmap == null) return;
            mainHandler.post(() -> {
                if (!coverUrl.equals(latestCoverUrl)) return;
                try {
                    NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                    if (manager != null) {
                        manager.notify(
                            MediaSessionController.NOTIFICATION_ID,
                            buildNotification(latestPayload, latestTitle, latestArtist, latestCoverUrl)
                        );
                    }
                } catch (Throwable ignored) {
                }
            });
        }, "biu-notification-cover").start();
    }

    private Bitmap fetchCover(String rawUrl) throws Exception {
        String normalized = rawUrl.startsWith("//") ? "https:" + rawUrl : rawUrl;
        if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(normalized).openConnection();
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(7000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36");
            connection.setRequestProperty("Referer", "https://www.bilibili.com/");
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) return null;
            try (InputStream input = connection.getInputStream()) {
                Bitmap raw = BitmapFactory.decodeStream(input);
                if (raw == null) return null;
                int side = Math.min(raw.getWidth(), raw.getHeight());
                if (side <= 0) return null;
                Bitmap square = Bitmap.createBitmap(
                    raw,
                    Math.max(0, (raw.getWidth() - side) / 2),
                    Math.max(0, (raw.getHeight() - side) / 2),
                    side,
                    side
                );
                Bitmap scaled = Bitmap.createScaledBitmap(square, 128, 128, true);
                if (square != raw) raw.recycle();
                if (scaled != square) square.recycle();
                return scaled;
            }
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        setPlaybackWakeLock(false);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        try {
            if (audioManager != null && modeChangedListener != null
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.removeOnModeChangedListener(modeChangedListener);
            }
        } catch (Throwable ignored) {
        }
        modeChangedListener = null;
        callModeHandler.removeCallbacksAndMessages(null);
        mainHandler.removeCallbacksAndMessages(null);
        setPlaybackWakeLock(false);
        if (controller != null) {
            controller.release();
            controller = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    static void update(Context context, String payload) {
        if (context == null || payload == null) return;
        boolean hasTrack = false;
        try {
            hasTrack = new JSONObject(payload).optBoolean("hasTrack", false);
        } catch (Exception ignored) {
        }
        Intent intent = new Intent(context, PlaybackNotificationService.class)
            .putExtra(EXTRA_PAYLOAD, payload);
        try {
            if (hasTrack) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent);
                } else {
                    context.startService(intent);
                }
            } else {
                context.startService(intent);
            }
        } catch (Throwable ignored) {
            // Android 12+ can reject a background service start. The Activity
            // is normally alive for playback; this is a compatibility fallback.
        }
    }

    static void stop(Context context) {
        if (context == null) return;
        try {
            context.stopService(new Intent(context, PlaybackNotificationService.class));
        } catch (Throwable ignored) {
        }
    }
}
