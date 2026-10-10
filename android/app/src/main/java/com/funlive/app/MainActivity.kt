package com.funlive.app

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.WindowManager

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var pendingWebPermission: PermissionRequest? = null
    private val mediaPermissions = arrayOf(
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android native secure-window protection: blocks normal screenshots
        // and screen recordings for this app window.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val needs = mediaPermissions.filter {
                        checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
                    }
                    if (needs.isNotEmpty()) {
                        pendingWebPermission = request
                        requestPermissions(needs.toTypedArray(), 401)
                    } else {
                        request.grant(request.resources)
                    }
                }
            }
        }
        setContentView(webView)
        if (savedInstanceState == null) {
            webView.loadUrl("https://go-live-stream-app.onrender.com/account.html")
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 401) {
            val granted = mediaPermissions.all {
                checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
            }
            pendingWebPermission?.let { request ->
                if (granted) request.grant(request.resources) else request.deny()
            }
            pendingWebPermission = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        pendingWebPermission?.deny()
        webView.destroy()
        super.onDestroy()
    }
}
