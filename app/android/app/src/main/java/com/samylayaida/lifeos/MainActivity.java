package com.samylayaida.lifeos;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Re-issue the initial load with the Cloudflare Access Service Token
        // headers (Capacitor's Bridge has already started loading server.url
        // without them). Access answers a token-authenticated request with a
        // CF_Authorization cookie that the WebView's CookieManager persists,
        // so all subsequent XHR/subresource/navigation requests ride the
        // cookie. With no token baked in (headers empty — e.g. the CI-built
        // APK before Samy supplies the secrets) this is a no-op and the
        // WebView shows Access's normal email-OTP page instead.
        Map<String, String> headers = CfAccess.headers();
        String serverUrl = this.bridge.getServerUrl();
        if (!headers.isEmpty() && serverUrl != null) {
            WebView webView = this.bridge.getWebView();
            webView.loadUrl(serverUrl, headers);
        }
    }
}
