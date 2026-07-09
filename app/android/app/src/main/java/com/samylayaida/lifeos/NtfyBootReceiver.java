package com.samylayaida.lifeos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Restarts the ntfy subscription service after a reboot, so the app keeps
 * replacing the standalone ntfy app without needing to be opened first.
 * Starting a specialUse foreground service from BOOT_COMPLETED is on
 * Android's background-start exemption list.
 */
public class NtfyBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.i("NtfyPush", "Boot completed — starting subscription service");
            NtfyService.start(context);
        }
    }
}
