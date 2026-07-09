package com.samylayaida.lifeos;

import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.util.Map;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "CfAccess";

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
    }

    @Override
    public void onPause() {
        super.onPause();
        // Make CF_Authorization cookie persistence across process death
        // deterministic (WebView flushes lazily on its own schedule).
        CookieManager.getInstance().flush();
    }
}
