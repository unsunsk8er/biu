package com.unsunsk8er.biu;

import android.app.Activity;
import android.content.Context;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

/**
 * Native media session + MediaStyle notification for the WebView player.
 * Transport actions call back into the player through MainActivity's
 * broadcast receiver / JS bridge. Artwork/session metadata comes from the
 * current track's cover URL.
 */
final class MediaSessionController {
    static final String ACTION_MEDIA_COMMAND = "com.unsunsk8er.biu.MEDIA_COMMAND";
    static final String CHANNEL_ID = "biu_media";
    static final int NOTIFICATION_ID = 0x4255;

    interface CommandListener {
        void onCommand(String command);
    }

    private final Context activity;
    private final CommandListener listener;
    private final NotificationManager notificationManager;
    private final MediaSession mediaSession;
    private final Handler main = new Handler(Looper.getMainLooper());

    MediaSessionController(Context activity, CommandListener listener) {
        this.activity = activity;
        this.listener = listener;
        this.notificationManager = (NotificationManager) activity.getSystemService(Activity.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "biu 播放控制", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("播放、暂停和切歌");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            notificationManager.createNotificationChannel(channel);
        }
        this.mediaSession = new MediaSession(activity, "biu");
        this.mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { dispatch("play"); }
            @Override public void onPause() { dispatch("pause"); }
            @Override public void onSkipToNext() { dispatch("next"); }
            @Override public void onSkipToPrevious() { dispatch("prev"); }
        });
    }

    void update(String raw) {
        updateInternal(raw, true);
    }

    /** Update MediaSession metadata/state without replacing a custom foreground notification. */
    void updateSession(String raw) {
        updateInternal(raw, false);
    }

    private void updateInternal(String raw, boolean withNotification) {
        JSONObject data;
        try {
            data = new JSONObject(raw == null ? "{}" : raw);
        } catch (Exception error) {
            return;
        }
        JSONObject snapshot = data;
        main.post(() -> apply(snapshot, withNotification));
    }

    MediaSession.Token getSessionToken() {
        return mediaSession.getSessionToken();
    }

    void dispatch(String command) {
        main.post(() -> listener.onCommand(command));
    }

    private void apply(JSONObject data, boolean withNotification) {
        try {
        boolean hasTrack = data.optBoolean("hasTrack", false);
        if (!hasTrack) {
            mediaSession.setActive(false);
            if (withNotification) notificationManager.cancel(NOTIFICATION_ID);
            return;
        }

        String title = data.optString("title", "未命名歌曲");
        String artist = data.optString("artist", "biu");
        String coverUrl = data.optString("coverUrl", "");
        boolean isPlaying = data.optBoolean("isPlaying", false);
        long positionMs = Math.max(0, Math.round(data.optDouble("position", 0) * 1000));
        long durationMs = Math.max(0, Math.round(data.optDouble("duration", 0) * 1000));

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, "biu")
            .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
        if (!coverUrl.isEmpty()) {
            String artUri = coverUrl.startsWith("//") ? "https:" + coverUrl : coverUrl;
            metadata.putString(MediaMetadata.METADATA_KEY_ART_URI, artUri);
            metadata.putString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI, artUri);
        }
        mediaSession.setMetadata(metadata.build());

        long actions = PlaybackState.ACTION_PLAY
            | PlaybackState.ACTION_PAUSE
            | PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_NEXT
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        int state = isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        mediaSession.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(state, positionMs, isPlaying ? 1f : 0f)
            .build());
        mediaSession.setActive(true);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(activity, CHANNEL_ID)
            : new Notification.Builder(activity);
        builder.setSmallIcon(R.drawable.ic_stat_biu)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(openAppIntent())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(true)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));

        builder.addAction(notificationAction("上一首", android.R.drawable.ic_media_previous, "prev", 1));
        builder.addAction(notificationAction(
            isPlaying ? "暂停" : "播放",
            isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            "play-pause",
            2
        ));
        builder.addAction(notificationAction("下一首", android.R.drawable.ic_media_next, "next", 3));

        if (withNotification) {
            try {
                notificationManager.notify(NOTIFICATION_ID, builder.build());
            } catch (Throwable ignored) {
                // Android 13+ permission or HarmonyOS container notification bridge.
            }
        }
        } catch (Throwable ignored) {
            // Some Android compatibility containers do not implement MediaSession.
        }
    }

    private Notification.Action notificationAction(String title, int iconRes, String command, int requestCode) {
        Intent intent = new Intent(ACTION_MEDIA_COMMAND)
            .setPackage(activity.getPackageName())
            .putExtra("command", command);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getBroadcast(activity, requestCode, intent, flags);
        return new Notification.Action.Builder(
            Icon.createWithResource(activity, iconRes), title, pending
        ).build();
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(activity, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(activity, 0, intent, flags);
    }

    void release() {
        try {
            mediaSession.setActive(false);
            mediaSession.release();
            notificationManager.cancel(NOTIFICATION_ID);
        } catch (Throwable ignored) {
            // Container may not expose a media notification bridge.
        }
    }
}
