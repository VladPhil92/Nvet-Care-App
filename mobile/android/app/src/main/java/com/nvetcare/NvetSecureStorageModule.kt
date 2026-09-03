package com.nvetcare

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Native session vault backed by Android Keystore.
 *
 * Tokens never touch AsyncStorage/SharedPreferences in plaintext. SharedPreferences
 * only stores AES-GCM ciphertext while the AES key is non-exportable inside
 * AndroidKeyStore. There is intentionally no insecure runtime fallback.
 */
class NvetSecureStorageModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val MODULE_NAME = "NvetSecureStorage"
    private const val KEY_ALIAS = "nvetcare.session.v1"
    private const val PREFS_NAME = "nvet_secure_session_v1"
    private const val ACCESS_KEY = "access_token"
    private const val REFRESH_KEY = "refresh_token"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
  }

  private val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun setTokens(accessToken: String, refreshToken: String, promise: Promise) {
    try {
      prefs.edit()
        .putString(ACCESS_KEY, encrypt(accessToken))
        .putString(REFRESH_KEY, encrypt(refreshToken))
        .apply()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_STORAGE_WRITE_FAILED", "No se pudo proteger la sesión", error)
    }
  }

  @ReactMethod
  fun getTokens(promise: Promise) {
    try {
      val encryptedAccess = prefs.getString(ACCESS_KEY, null)
      val encryptedRefresh = prefs.getString(REFRESH_KEY, null)
      if (encryptedAccess.isNullOrBlank() || encryptedRefresh.isNullOrBlank()) {
        promise.resolve(null)
        return
      }

      val result = Arguments.createMap().apply {
        putString("accessToken", decrypt(encryptedAccess))
        putString("refreshToken", decrypt(encryptedRefresh))
      }
      promise.resolve(result)
    } catch (error: Exception) {
      // Corrupted/undecryptable session material is never reused.
      prefs.edit().clear().apply()
      promise.reject("SECURE_STORAGE_READ_FAILED", "La sesión protegida no pudo recuperarse", error)
    }
  }

  @ReactMethod
  fun clearTokens(promise: Promise) {
    try {
      prefs.edit().clear().apply()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_STORAGE_CLEAR_FAILED", "No se pudo limpiar la sesión", error)
    }
  }

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun encrypt(plainText: String): String {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val ciphertext = Base64.encodeToString(
      cipher.doFinal(plainText.toByteArray(Charsets.UTF_8)),
      Base64.NO_WRAP,
    )
    return "v1:$iv:$ciphertext"
  }

  private fun decrypt(value: String): String {
    val parts = value.split(":", limit = 3)
    require(parts.size == 3 && parts[0] == "v1") { "Unsupported secure storage payload" }

    val iv = Base64.decode(parts[1], Base64.NO_WRAP)
    val ciphertext = Base64.decode(parts[2], Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
    return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
  }
}
