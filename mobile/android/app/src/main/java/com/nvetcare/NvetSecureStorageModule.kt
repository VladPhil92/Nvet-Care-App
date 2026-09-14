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
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Native session/federation vault backed by Android Keystore.
 *
 * Access and refresh tokens never touch AsyncStorage/SharedPreferences in
 * plaintext. PKCE verifier/state are also generated natively and stored only
 * as AES-GCM ciphertext for the short federation round trip. There is
 * intentionally no insecure runtime fallback.
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
    private const val FEDERATION_STATE_KEY = "ctgone_federation_state"
    private const val FEDERATION_VERIFIER_KEY = "ctgone_federation_verifier"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
  }

  private val prefs = reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val secureRandom = SecureRandom()

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
      clearSessionMaterial()
      promise.reject("SECURE_STORAGE_READ_FAILED", "La sesión protegida no pudo recuperarse", error)
    }
  }

  @ReactMethod
  fun clearTokens(promise: Promise) {
    try {
      clearSessionMaterial()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SECURE_STORAGE_CLEAR_FAILED", "No se pudo limpiar la sesión", error)
    }
  }

  /**
   * Generates state + PKCE verifier with SecureRandom and persists both only
   * as encrypted values. JavaScript receives state and S256 challenge, never
   * the verifier.
   */
  @ReactMethod
  fun createCtgFederationRequest(promise: Promise) {
    try {
      val state = randomBase64Url(32)
      val verifier = randomBase64Url(64)
      val challenge = base64Url(
        MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)),
      )

      prefs.edit()
        .putString(FEDERATION_STATE_KEY, encrypt(state))
        .putString(FEDERATION_VERIFIER_KEY, encrypt(verifier))
        .apply()

      promise.resolve(
        Arguments.createMap().apply {
          putString("state", state)
          putString("codeChallenge", challenge)
          putString("codeChallengeMethod", "S256")
        },
      )
    } catch (error: Exception) {
      clearFederationMaterial()
      promise.reject("FEDERATION_REQUEST_FAILED", "No se pudo iniciar el acceso con CTG One", error)
    }
  }

  /**
   * Validates callback state in native code, atomically consumes the pending
   * request, and returns the verifier once. Replays cannot recover it again.
   */
  @ReactMethod
  fun consumeCtgFederationRequest(callbackState: String, promise: Promise) {
    try {
      val encryptedState = prefs.getString(FEDERATION_STATE_KEY, null)
      val encryptedVerifier = prefs.getString(FEDERATION_VERIFIER_KEY, null)
      if (encryptedState.isNullOrBlank() || encryptedVerifier.isNullOrBlank()) {
        promise.reject("FEDERATION_REQUEST_MISSING", "No existe una solicitud CTG One pendiente")
        return
      }

      val expectedState = decrypt(encryptedState)
      if (!constantTimeEquals(expectedState, callbackState)) {
        clearFederationMaterial()
        promise.reject(
          "FEDERATION_STATE_MISMATCH",
          "La respuesta de CTG One no coincide con la solicitud iniciada",
        )
        return
      }

      val verifier = decrypt(encryptedVerifier)
      clearFederationMaterial()
      promise.resolve(verifier)
    } catch (error: Exception) {
      clearFederationMaterial()
      promise.reject("FEDERATION_CONSUME_FAILED", "No se pudo validar la respuesta de CTG One", error)
    }
  }

  @ReactMethod
  fun clearCtgFederationRequest(promise: Promise) {
    try {
      clearFederationMaterial()
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("FEDERATION_CLEAR_FAILED", "No se pudo limpiar la solicitud CTG One", error)
    }
  }

  private fun clearSessionMaterial() {
    prefs.edit()
      .remove(ACCESS_KEY)
      .remove(REFRESH_KEY)
      .apply()
  }

  private fun clearFederationMaterial() {
    prefs.edit()
      .remove(FEDERATION_STATE_KEY)
      .remove(FEDERATION_VERIFIER_KEY)
      .apply()
  }

  private fun randomBase64Url(byteCount: Int): String {
    val bytes = ByteArray(byteCount)
    secureRandom.nextBytes(bytes)
    return base64Url(bytes)
  }

  private fun base64Url(bytes: ByteArray): String =
    Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  private fun constantTimeEquals(left: String, right: String): Boolean =
    MessageDigest.isEqual(left.toByteArray(Charsets.UTF_8), right.toByteArray(Charsets.UTF_8))

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
