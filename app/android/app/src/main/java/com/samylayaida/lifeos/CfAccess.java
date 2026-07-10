package com.samylayaida.lifeos;

import java.util.HashMap;
import java.util.Map;

/**
 * Cloudflare Access Service Token support (ROADMAP T18b).
 *
 * Mirrors src/lib/mobile/cf-access.ts — android-consistency.test.ts asserts
 * the header names and the both-or-nothing rule stay in sync between the two.
 * The token values arrive via BuildConfig fields injected at BUILD time from
 * the CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET env vars (see
 * android/app/build.gradle); they are never committed to the repo. When
 * either value is missing the map is empty and the WebView falls back to
 * Cloudflare Access's interactive email-OTP page.
 */
final class CfAccess {
    static final String ID_HEADER = "CF-Access-Client-Id";
    static final String SECRET_HEADER = "CF-Access-Client-Secret";

    private CfAccess() {}

    static Map<String, String> headers() {
        return headers(BuildConfig.CF_ACCESS_CLIENT_ID, BuildConfig.CF_ACCESS_CLIENT_SECRET);
    }

    /** Both-or-nothing, same rule as buildCfAccessHeaders() in cf-access.ts:
     * a half-configured token must never send one header alone. */
    static Map<String, String> headers(String clientId, String clientSecret) {
        Map<String, String> headers = new HashMap<>();
        String id = clientId == null ? "" : clientId.trim();
        String secret = clientSecret == null ? "" : clientSecret.trim();
        if (id.isEmpty() || secret.isEmpty()) {
            return headers;
        }
        headers.put(ID_HEADER, id);
        headers.put(SECRET_HEADER, secret);
        return headers;
    }
}
