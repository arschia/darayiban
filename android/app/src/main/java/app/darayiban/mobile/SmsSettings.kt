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

    val isConfigured: Boolean
        get() = !endpoint.isNullOrBlank() && secureTokenStore.read() != null

    fun token(): String? = secureTokenStore.read()

    fun configure(token: String, endpoint: String, tokenId: String) {
        secureTokenStore.write(token)
        preferences.edit()
            .putString(ENDPOINT, endpoint)
            .putString(TOKEN_ID, tokenId)
            .apply()
    }

    fun clear() {
        secureTokenStore.clear()
        preferences.edit().remove(ENDPOINT).remove(TOKEN_ID).apply()
    }

    private companion object {
        const val PREFERENCES = "darayiban_android"
        const val ENDPOINT = "sms_endpoint"
        const val TOKEN_ID = "automation_token_id"
    }
}
