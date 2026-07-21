package com.samylayaida.lifeos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Foreground service holding a persistent subscription to the homelab's
 * self-hosted ntfy instance and rendering each message as a native LifeOS
 * notification (replaces the standalone ntfy Android app).
 *
 * Mirrors src/lib/mobile/ntfy.ts — ntfy-consistency.test.ts asserts the
 * endpoint, channel ids and priority mapping stay in sync. Transport is
 * ntfy's newline-delimited JSON stream (GET /homelab/json), read on a
 * background thread over plain HttpURLConnection + org.json — no new
 * dependencies. Reconnects with exponential backoff (5s..5min) and resumes
 * via ?since=<last rendered message id> (SharedPreferences), so messages
 * missed while disconnected replay instead of dropping.
 *
 * Foreground-service type is "specialUse" (self-hosted push has no matching
 * platform type; dataSync would be killed after 6h on Android 15+). The
 * mandatory persistent notification lives on a MIN-importance channel.
 * No Cloudflare Access headers here: ntfy is reached directly over the
 * tailnet, not through lab.samylayaida.com.
 */
public class NtfyService extends Service {

    private static final String TAG = "NtfyPush";

    // Keep in sync with src/lib/mobile/ntfy.ts (ntfy-consistency.test.ts).
    static final String NTFY_BASE_URL = "http://100.124.149.101:8096";
    static final String NTFY_TOPIC = "homelab";
    static final String PAGER_PATH = "/pager";
    static final String OPEN_PATH_EXTRA = "com.samylayaida.lifeos.OPEN_PATH";
    // The app's public origin — deep-link click URLs must live on it.
    // (Duplicated from cf-access.ts on purpose: this class never touches
    // Cloudflare Access. ntfy-consistency.test.ts pins the value.)
    static final String CLICK_URL_BASE = "https://lab.samylayaida.com";

    static final String CHANNEL_SERVICE = "ntfy_service";
    static final String CHANNEL_URGENT = "pager_urgent";
    static final String CHANNEL_DEFAULT = "pager_default";
    static final String CHANNEL_LOW = "pager_low";

    private static final int SERVICE_NOTIFICATION_ID = 1;
    private static final String PREFS = "ntfy";
    private static final String PREF_LAST_ID = "last_message_id";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    // ntfy keepalives arrive every ~45s; 3 missed keepalives = dead link.
    private static final int READ_TIMEOUT_MS = 150_000;
    private static final long BACKOFF_MIN_MS = 5_000;
    private static final long BACKOFF_MAX_MS = 300_000;

    private Thread worker;
    private volatile boolean stopped = false;

    /** Start (or ensure) the subscription service. Called from
     * MainActivity.onCreate and NtfyBootReceiver. */
    static void start(Context context) {
        Intent intent = new Intent(context, NtfyService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification persistent = new NotificationCompat.Builder(this, CHANNEL_SERVICE)
            .setSmallIcon(R.drawable.splash_mark)
            .setContentTitle("LifeOS pager connected")
            .setContentText("Listening for homelab notifications")
            .setOngoing(true)
            .setContentIntent(openPagerIntent())
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(SERVICE_NOTIFICATION_ID, persistent,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, persistent);
        }
        if (worker == null || !worker.isAlive()) {
            stopped = false;
            worker = new Thread(this::subscribeLoop, "ntfy-subscribe");
            worker.setDaemon(true);
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopped = true;
        if (worker != null) {
            worker.interrupt();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // --- subscription loop ---------------------------------------------------

    private void subscribeLoop() {
        long backoffMs = BACKOFF_MIN_MS;
        while (!stopped) {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(subscribeUrl(lastMessageId()));
                Log.i(TAG, "Subscribing to " + url);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while (!stopped && (line = reader.readLine()) != null) {
                        // Any traffic (incl. keepalives) proves the link is live.
                        backoffMs = BACKOFF_MIN_MS;
                        handleLine(line);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Subscription dropped: " + e.getClass().getSimpleName()
                    + " — reconnecting in " + (backoffMs / 1000) + "s");
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
            if (stopped) {
                break;
            }
            try {
                Thread.sleep(backoffMs);
            } catch (InterruptedException e) {
                break;
            }
            backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
        }
        Log.i(TAG, "Subscription loop stopped");
    }

    /** Mirrors subscribeUrl() in ntfy.ts: resume from the last rendered
     * message id so a reconnect replays what was missed. */
    static String subscribeUrl(String sinceId) throws Exception {
        String base = NTFY_BASE_URL + "/" + NTFY_TOPIC + "/json";
        if (sinceId == null || sinceId.isEmpty()) {
            return base;
        }
        return base + "?since=" + URLEncoder.encode(sinceId, "UTF-8");
    }

    /** Mirrors parseNtfyEvent() in ntfy.ts: only `message` events with an id
     * and a body render; keepalive/open/malformed lines are dropped. */
    private void handleLine(String line) {
        JSONObject event;
        try {
            event = new JSONObject(line);
        } catch (Exception e) {
            return;
        }
        if (!"message".equals(event.optString("event"))) {
            return;
        }
        String id = event.optString("id", "");
        String message = event.optString("message", "");
        if (id.isEmpty() || message.isEmpty()) {
            return;
        }
        String title = event.optString("title", "");
        int priority = event.optInt("priority", 3);
        String click = event.optString("click", "");
        showMessage(id, title, message, priority, click);
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString(PREF_LAST_ID, id).apply();
    }

    private void showMessage(String id, String title, String message, int priority, String click) {
        Notification notification = new NotificationCompat.Builder(this, channelForPriority(priority))
            .setSmallIcon(R.drawable.splash_mark)
            .setContentTitle(title.isEmpty() ? "LifeOS" : title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
            .setContentIntent(openPathIntent(id.hashCode(), pathFromClick(click)))
            .build();
        NotificationManager manager = getSystemService(NotificationManager.class);
        // ntfy ids are unique per message; hashCode keeps distinct messages
        // as distinct notifications (and a replayed id replaces itself).
        manager.notify(id.hashCode(), notification);
        Log.i(TAG, "Rendered message " + id + " priority=" + priority);
    }

    /** Same thresholds as channelForPriority() in ntfy.ts:
     * urgent/high (4-5) -> heads-up, min/low (1-2) -> silent, else default. */
    static String channelForPriority(int priority) {
        if (priority >= 4) {
            return CHANNEL_URGENT;
        }
        if (priority <= 2) {
            return CHANNEL_LOW;
        }
        return CHANNEL_DEFAULT;
    }

    /** Mirrors pathFromClick() in ntfy.ts: a click URL on the app's own
     * origin (or a bare absolute in-app path) deep-links; anything else —
     * empty, foreign origin, protocol-relative "//" — opens the pager. */
    static String pathFromClick(String click) {
        if (click == null || click.isEmpty()) {
            return PAGER_PATH;
        }
        if (click.startsWith("/")) {
            return click.startsWith("//") ? PAGER_PATH : click;
        }
        if (click.startsWith(CLICK_URL_BASE + "/")) {
            return click.substring(CLICK_URL_BASE.length());
        }
        return PAGER_PATH;
    }

    private PendingIntent openPathIntent(int requestCode, String path) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra(OPEN_PATH_EXTRA, path);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // requestCode = message id hash: extras don't count for Intent
        // equality, so a shared code would collapse every pending tap onto
        // the most recent message's path.
        return PendingIntent.getActivity(this, requestCode, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel service = new NotificationChannel(CHANNEL_SERVICE,
            "Pager connection", NotificationManager.IMPORTANCE_MIN);
        service.setDescription("Persistent notification keeping the homelab pager subscription alive");
        NotificationChannel urgent = new NotificationChannel(CHANNEL_URGENT,
            "Pager: critical", NotificationManager.IMPORTANCE_HIGH);
        NotificationChannel normal = new NotificationChannel(CHANNEL_DEFAULT,
            "Pager: routine", NotificationManager.IMPORTANCE_DEFAULT);
        NotificationChannel low = new NotificationChannel(CHANNEL_LOW,
            "Pager: low", NotificationManager.IMPORTANCE_LOW);
        manager.createNotificationChannel(service);
        manager.createNotificationChannel(urgent);
        manager.createNotificationChannel(normal);
        manager.createNotificationChannel(low);
    }

    private String lastMessageId() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_LAST_ID, null);
    }
}
