package com.samylayaida.lifeos;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "CfAccess";

    /** Sibling Access-protected hosts that open IN this WebView (see
     * CfAccessWebViewClient) — mirrored from cf-access.ts
     * (SIBLING_IN_APP_HOSTS); android-consistency.test.ts keeps the two in
     * sync. Android BACK on one of these must return to the LifeOS UI in one
     * press instead of walking that site's own history / exiting the app. */
    private static final String[] SIBLING_IN_APP_HOSTS = { "grafana.samylayaida.com" };

    private static boolean isSiblingInAppHost(String host) {
        for (String sibling : SIBLING_IN_APP_HOSTS) {
            if (sibling.equals(host)) {
                return true;
            }
        }
        return false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the whole Cloudflare Access flow inside the WebView (see
        // CfAccessWebViewClient). Must be installed BEFORE re-issuing the
        // load below: the Bridge's own initial (headerless) load may already
        // be redirecting to the Access login host, and Capacitor's default
        // client would punt that redirect to the external browser.
        this.bridge.setWebViewClient(new CfAccessWebViewClient(this.bridge));

        // Default is already true, but be explicit: the CF_Authorization
        // cookie Access sets on an authenticated response is the only thing
        // that carries follow-up XHR/subresource requests.
        CookieManager.getInstance().setAcceptCookie(true);

        // Re-issue the initial load with the Cloudflare Access Service Token
        // headers (Capacitor's Bridge has already started loading server.url
        // without them). Access answers a token-authenticated request with a
        // CF_Authorization cookie that the WebView's CookieManager persists,
        // so all subsequent XHR/subresource/navigation requests ride the
        // cookie. With no token baked in (headers empty — e.g. the CI-built
        // APK) this is a no-op and the WebView shows Access's email-OTP page
        // in-app instead.
        Map<String, String> headers = CfAccess.headers();
        String serverUrl = this.bridge.getServerUrl();
        if (!headers.isEmpty() && serverUrl != null) {
            Log.i(TAG, "Re-issuing initial load of " + serverUrl + " with Service Token headers");
            WebView webView = this.bridge.getWebView();
            webView.loadUrl(serverUrl, headers);
        } else {
            Log.i(TAG, "No Service Token baked into this build; Access login will show in-app");
        }

        // Native ntfy push (replaces the standalone ntfy app): ask for
        // notification permission on 13+, then keep the subscription
        // foreground service running. See NtfyService.java / ntfy.ts.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }
        NtfyService.start(this);

        // Android BACK on a sibling in-app host (e.g. Grafana) returns to the
        // LifeOS UI in one press instead of walking that site's own history
        // or exiting the app; BACK on the LifeOS host itself keeps stock
        // WebView/Activity behavior (disable this callback and re-dispatch).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = MainActivity.this.bridge.getWebView();
                String currentUrl = webView.getUrl();
                String host = currentUrl == null ? null : Uri.parse(currentUrl).getHost();
                if (host != null && isSiblingInAppHost(host)) {
                    String serverUrl = MainActivity.this.bridge.getServerUrl();
                    Log.i(TAG, "Back pressed on sibling host " + host + "; returning to LifeOS");
                    webView.loadUrl(serverUrl);
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });

        // Launched from a pager notification: navigate to the requested path.
        openRequestedPath(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // launchMode is singleTask: a notification tap while the app is
        // already running lands here instead of onCreate.
        openRequestedPath(intent);
    }

    /** Navigate the WebView to an in-app path (e.g. /pager) requested via
     * the OPEN_PATH intent extra a notification tap carries. The Service
     * Token headers ride along (a no-op once CF_Authorization is set). */
    private void openRequestedPath(Intent intent) {
        String path = intent == null ? null : intent.getStringExtra(NtfyService.OPEN_PATH_EXTRA);
        String serverUrl = this.bridge.getServerUrl();
        if (path == null || !path.startsWith("/") || serverUrl == null) {
            return;
        }
        Log.i(TAG, "Opening requested path " + path);
        this.bridge.getWebView().loadUrl(serverUrl + path, CfAccess.headers());
    }

    @Override
    public void onPause() {
        super.onPause();
        // Make CF_Authorization cookie persistence across process death
        // deterministic (WebView flushes lazily on its own schedule).
        CookieManager.getInstance().flush();
    }
}
