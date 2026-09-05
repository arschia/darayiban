package app.darayiban.mobile

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import androidx.work.WorkManager
import androidx.work.WorkInfo
import org.json.JSONObject

@CapacitorPlugin(
    name = "SmsBridge",
    permissions = [Permission(alias = "sms", strings = [Manifest.permission.RECEIVE_SMS])],
)
class SmsBridgePlugin : Plugin() {
    private val executor = Executors.newSingleThreadExecutor()
    @PluginMethod
    fun getStatus(call: PluginCall) {
        executor.execute {
            runCatching { status(includeQueue = true) }
                .onSuccess { call.resolve(it) }.onFailure { call.reject("وضعیت صف خوانده نشد.") }
        }
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
        val userId = call.getString("userId")?.trim().orEmpty()
        if (token.isBlank() || tokenId.isBlank() || userId.isBlank() || !isAllowedEndpoint(endpoint)) {
            call.reject("تنظیمات اتصال معتبر نیست.")
            return
        }

        executor.execute {
            runCatching {
                val response = SmsHttpClient.post(endpoint, token, JSONObject().put("operation", "status"))
                check(response.code == 200 && response.body?.optBoolean("ok") == true && response.body.optString("user_id") == userId)
                SmsSettings(context).configure(token, endpoint, tokenId, userId)
                call.resolve(status())
            }.onFailure { call.reject("اتصال به حساب تأیید نشد. اینترنت را بررسی و دوباره تلاش کن.") }
        }
    }

    @PluginMethod
    fun checkConnection(call: PluginCall) {
        executor.execute {
            val settings = SmsSettings(context)
            val result = runCatching {
                val response = SmsHttpClient.post(settings.endpoint ?: error("missing endpoint"),
                    settings.token() ?: error("missing token"), JSONObject().put("operation", "status"))
                response.code == 200 && response.body?.optBoolean("ok") == true && response.body.optString("user_id") == settings.userId
            }.getOrDefault(false)
            call.resolve(JSObject().apply { put("connected", result) })
        }
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        SmsSettings(context).userId?.let { WorkManager.getInstance(context).cancelAllWorkByTag("sms-owner:$it") }
        SmsSettings(context).clear()
        call.resolve(status())
    }

    private fun status(includeQueue: Boolean = false): JSObject {
        val settings = SmsSettings(context)
        return JSObject().apply {
            put("supported", true)
            put("configured", settings.isConfigured)
            put("permission", getPermissionState("sms").toString())
            put("tokenId", settings.tokenId)
            put("userId", settings.userId)
            put("lastReceivedAt", settings.lastReceivedAt)
            put("lastUploadedAt", settings.lastUploadedAt)
            put("lastResult", settings.lastResult)
            if (includeQueue && settings.userId != null) {
                val jobs = WorkManager.getInstance(context).getWorkInfosByTag("sms-owner:${settings.userId}").get(5, TimeUnit.SECONDS)
                put("pendingCount", jobs.count { !it.state.isFinished })
                put("failedCount", jobs.count { it.state == WorkInfo.State.FAILED })
            }
        }
    }

    override fun handleOnDestroy() {
        executor.shutdown()
        super.handleOnDestroy()
    }

    private fun isAllowedEndpoint(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.scheme == "https" && uri.host == "iilpkekzjbwqlvjtcbqs.supabase.co" &&
            uri.path == "/functions/v1/ingest-sms"
    }.getOrDefault(false)
}
