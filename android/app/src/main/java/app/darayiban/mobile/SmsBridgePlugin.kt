package app.darayiban.mobile

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.annotation.PluginMethod
import java.net.URI

@CapacitorPlugin(
    name = "SmsBridge",
    permissions = [Permission(alias = "sms", strings = [Manifest.permission.RECEIVE_SMS])],
)
class SmsBridgePlugin : Plugin() {
    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(status())
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            call.resolve(status())
            return
        }
        requestPermissionForAlias("sms", call, "smsPermissionCallback")
    }

    @PermissionCallback
    private fun smsPermissionCallback(call: PluginCall) {
        call.resolve(status())
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        val token = call.getString("token")?.trim().orEmpty()
        val endpoint = call.getString("endpoint")?.trim().orEmpty()
        val tokenId = call.getString("tokenId")?.trim().orEmpty()
        if (token.isBlank() || tokenId.isBlank() || !isAllowedEndpoint(endpoint)) {
            call.reject("تنظیمات اتصال معتبر نیست.")
            return
        }

        runCatching {
            SmsSettings(context).configure(token, endpoint, tokenId)
        }.onSuccess {
            call.resolve(status())
        }.onFailure {
            call.reject("ذخیره امن اتصال انجام نشد.")
        }
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        SmsSettings(context).clear()
        call.resolve(status())
    }

    private fun status(): JSObject {
        val settings = SmsSettings(context)
        return JSObject().apply {
            put("supported", true)
            put("configured", settings.isConfigured)
            put("permission", getPermissionState("sms").toString())
            put("tokenId", settings.tokenId)
        }
    }

    private fun isAllowedEndpoint(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.scheme == "https" && uri.host == "iilpkekzjbwqlvjtcbqs.supabase.co" &&
            uri.path == "/functions/v1/ingest-sms"
    }.getOrDefault(false)
}
