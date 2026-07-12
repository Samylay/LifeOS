package com.samylayaida.lifeos;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Map;

/**
 * Keeps the whole Cloudflare Access auth flow inside the app's WebView
 * (ROADMAP T18b — found the hard way on the first real device run,
 * 2026-07-09).
 *
 * What actually happens without this class: Capacitor's Bridge starts the
 * initial load of server.url WITHOUT the Service Token headers (MainActivity
 * only re-issues it afterwards, a race), Access answers 302 to
 * <team>.cloudflareaccess.com, and Bridge.launchIntent() punts any host
 * outside allowNavigation to the EXTERNAL browser via ACTION_VIEW. The
 * external browser has its own cookie jar, so even a completed email-OTP
 * login there can never authenticate this WebView — the app comes back to a
 * blank page.
 *
 * Two behaviors fix both failure modes:
 * 1. A navigation to the Access login host while a Service Token is baked in
 *    means a load reached Access without (accepted) headers — re-issue
 *    server.url with the headers, a bounded number of times. WebView's
 *    loadUrl(url, headers) only attaches headers to that one request, never
 *    to follow-up redirects, so this is also the recovery path when the
 *    CF_Authorization cookie expires later.
 * 2. Once the retries are spent (token rejected server-side — e.g. not yet
 *    in the Access policy) or no token is baked in at all, let the login
 *    page load IN the WebView: the interactive OTP fallback then sets its
 *    CF_Authorization cookie in the app's own cookie jar, where it works.
 */
public class CfAccessWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "CfAccess";

    /** Any Cloudflare Access team login host — mirrored in cf-access.ts
     * (CF_ACCESS_LOGIN_HOST_SUFFIX); android-consistency.test.ts keeps the
     * two in sync. */
    static final String ACCESS_LOGIN_HOST_SUFFIX = ".cloudflareaccess.com";

    /** One retry covers the headerless-initial-load race, the second a
     * genuine transient; after that stop looping and show the interactive
     * login in-app instead. */
    private int headerRetriesLeft = 2;

    private final Bridge bridge;

    public CfAccessWebViewClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String host = url.getHost();
        if (host != null && host.endsWith(ACCESS_LOGIN_HOST_SUFFIX)) {
            // Which Access application challenged? The login path is
            // /cdn-cgi/access/login/<protected-hostname>. The Service Token
            // is only in the LifeOS app's Access policy, so re-issuing with
            // headers is only correct for OUR host; a sibling in-app host
            // (e.g. Grafana) must fall through to its interactive login in
            // the WebView — re-issuing server.url here would silently hijack
            // the navigation back to the app home.
            String challenged = url.getLastPathSegment();
            String serverHost = Uri.parse(bridge.getServerUrl()).getHost();
            boolean forOwnApp = serverHost != null && serverHost.equals(challenged);
            Map<String, String> headers = CfAccess.headers();
            if (forOwnApp && !headers.isEmpty() && headerRetriesLeft > 0) {
                headerRetriesLeft--;
                Log.i(
                    TAG,
                    "Access challenged; re-issuing " +
                    bridge.getServerUrl() +
                    " with Service Token headers (" +
                    headerRetriesLeft +
                    " retries left)"
                );
                view.loadUrl(bridge.getServerUrl(), headers);
                return true;
            }
            Log.i(TAG, "Keeping Access interactive login in-app (login host " + host + ", app " + challenged + ")");
            return false;
        }
        // Everything else: Capacitor's stock behavior (in-app for the LifeOS
        // host, external browser for genuinely external links).
        return super.shouldOverrideUrlLoading(view, request);
    }
}
