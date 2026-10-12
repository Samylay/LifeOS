package com.samylayaida.lifeos;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onPause() {
        super.onPause();
        // Persist the login cookie across process death (WebView flushes lazily).
        CookieManager.getInstance().flush();
    }
}
