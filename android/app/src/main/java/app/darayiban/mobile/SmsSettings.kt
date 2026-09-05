package app.darayiban.mobile

import android.content.Context

internal class SmsSettings(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val secureTokenStore = SecureTokenStore(appContext)

    val endpoint: String?
        get() = preferences.getString(ENDPOINT, null)

    val tokenId: String?
        get() = preferences.getString(TOKEN_ID, null)

    val userId: String? get() = preferences.getString("user_id", null)
    val lastReceivedAt: Long get() = preferences.getLong("last_received_at", 0)
    val lastUploadedAt: Long get() = preferences.getLong("last_uploaded_at", 0)
    val lastResult: String? get() = preferences.getString("last_result", null)

    fun recordReceived(at: Long) { preferences.edit().putLong("last_received_at", at).apply() }
    fun recordResult(result: String) {
        val edit = preferences.edit().putString("last_result", result)
        if (result == "uploaded" || result == "duplicate") edit.putLong("last_uploaded_at", System.currentTimeMillis())
        edit.apply()
    }

    val isConfigured: Boolean
        get() = !endpoint.isNullOrBlank() && !userId.isNullOrBlank() && secureTokenStore.read() != null

    fun token(): String? = secureTokenStore.read()

    data class Connection(val userId: String, val token: String, val endpoint: String)
    fun connection(): Connection? = synchronized(LOCK) {
        val owner = userId ?: return@synchronized null
        val secret = secureTokenStore.read() ?: return@synchronized null
        val url = endpoint ?: return@synchronized null
        Connection(owner, secret, url)
    }

    fun configure(token: String, endpoint: String, tokenId: String, userId: String) = synchronized(LOCK) {
        secureTokenStore.write(token)
        preferences.edit()
            .putString(ENDPOINT, endpoint)
            .putString(TOKEN_ID, tokenId)
            .putString("user_id", userId)
            .remove("last_received_at").remove("last_uploaded_at").remove("last_result")
            .apply()
    }

    fun clear() = synchronized(LOCK) {
        secureTokenStore.clear()
        preferences.edit().clear().apply()
    }

    private companion object {
        val LOCK = Any()
        const val PREFERENCES = "darayiban_android"
        const val ENDPOINT = "sms_endpoint"
        const val TOKEN_ID = "automation_token_id"
    }
}
