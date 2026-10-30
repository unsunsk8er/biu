package com.unsunsk8er.biu;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final String TAG = "BiuAndroid";
    private WebView webView;
    private LocalAssetServer assetServer;
    private BiliProxy biliProxy;
    private BroadcastReceiver mediaCommandReceiver;
    private boolean backPending;
    private boolean lightTheme = true;
    // Keep the WebView edge-to-edge for the whole session. Toggling
    // decorFitsSystemWindows when Now Playing opened/closed resized the view
    // and caused a visible layout jump during the exit animation.
    private boolean nowPlayingImmersive = true;
    private int insetTopCss = 0;
    private int insetBottomCss = 0;
    private int pageGeneration = 0;
    private int lastProbedGeneration = -1;
    private int assetPort = 0;
    private String appOrigin = "";
    // 由 UI 线程更新；shouldInterceptRequest / JS bridge 线程只读，避免跨线程调用 WebView。
    private volatile boolean trustedPage = false;
    private boolean startupRecoveryAttempted = false;
    private boolean startupFallbackShown = false;

    private static final int LIGHT_BG = Color.rgb(246, 247, 249);
    private static final int DARK_BG = Color.rgb(15, 15, 17);

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Log.i(TAG, "device=" + Build.MANUFACTURER + "/" + Build.BRAND + " model=" + Build.MODEL
            + " release=" + Build.VERSION.RELEASE + " sdk=" + Build.VERSION.SDK_INT);
        try {
            webView = new WebView(this);
        } catch (Throwable error) {
            Log.e(TAG, "WebView unavailable in this Android container", error);
            showStartupError("当前运行环境未提供 Android WebView，biu 无法启动。\n请在卓易通中启用 WebView/系统组件后重试。");
            return;
        }
        webView.setBackgroundColor(LIGHT_BG);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(webView);
        installSystemInsetsListener();
        applySystemBars(lightTheme);

        // Commands from the foreground media notification are delivered as
        // broadcasts to this Activity, keeping the WebView player authoritative.
        mediaCommandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String command = intent == null ? null : intent.getStringExtra("command");
                if (command != null) dispatchMediaCommand(command);
            }
        };
        IntentFilter mediaFilter = new IntentFilter(MediaSessionController.ACTION_MEDIA_COMMAND);
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(mediaCommandReceiver, mediaFilter, Context.RECEIVER_NOT_EXPORTED);
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 71);
                }
            } else {
                registerReceiver(mediaCommandReceiver, mediaFilter);
            }
        } catch (Throwable error) {
            Log.w(TAG, "Media command receiver unavailable", error);
            mediaCommandReceiver = null;
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setUserAgentString(
            settings.getUserAgentString()
                + " BiuAndroid/" + BuildConfig.VERSION_NAME
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.addJavascriptInterface(new AndroidBridge(), "BiuAndroid");

        // A WebView can otherwise keep serving the previous APK's index.html
        // after an update, leaving old JS (and an old native bridge name) alive.
        // Invalidate the HTTP cache once per version and append a version query
        // to the entry URL as a second line of defence.
        android.content.SharedPreferences assetPrefs =
            getSharedPreferences("biu_asset_cache", MODE_PRIVATE);
        int cachedAssetVersion = assetPrefs.getInt("version", 0);
        if (cachedAssetVersion != BuildConfig.VERSION_CODE) {
            webView.clearCache(true);
            assetPrefs.edit().putInt("version", BuildConfig.VERSION_CODE).apply();
        }

        try {
            assetServer = new LocalAssetServer(getAssets(), "www");
            int port = assetServer.start();
            assetPort = port;
            String origin = "http://127.0.0.1:" + port;
            appOrigin = origin;
            biliProxy = new BiliProxy(origin);
            String startUrl = origin + "/index.html?v=" + BuildConfig.VERSION_CODE;

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    // 只允许本地打包页面使用 B 站代理；远程 iframe/页面拿不到 Cookie。
                    // 注意：本回调在非 UI 线程执行，只能读 volatile 标志，不能调用 webView.getUrl()。
                    if (!trustedPage || biliProxy == null) return null;
                    try {
                        return biliProxy.intercept(request);
                    } catch (Throwable error) {
                        Log.e(TAG, "BiliProxy intercept failed", error);
                        return null;
                    }
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    String target = uri.toString();
                    if (!appOrigin.isEmpty() && target.startsWith(appOrigin + "/")) return false;
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                    }
                    return true;
                }

                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    pageGeneration += 1;
                    updateTrustedPage(url);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    updateTrustedPage(url);
                    Log.i(TAG, "page finished: " + url);
                    injectSafeAreaInsets();
                    final int generation = pageGeneration;
                    if (url != null && url.contains("index.html") && generation != lastProbedGeneration) {
                        lastProbedGeneration = generation;
                        view.postDelayed(() -> probeStartupPage(generation), 12_000);
                    }
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request != null && request.isForMainFrame()) {
                        Log.e(TAG, "main page load error: " + error.getErrorCode() + " " + error.getDescription());
                        trustedPage = false;
                        showStartupError("biu 页面加载失败。\n请检查网络或稍后点击重试。");
                    }
                }

                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    Log.e(TAG, "WebView render process gone, crashed=" + detail.didCrash());
                    showStartupError("biu 页面渲染进程已退出。\n点击重试可重新加载界面。");
                    return true;
                }
            });

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                    Log.d(TAG, "web: " + message.message() + " @" + message.lineNumber());
                    return true;
                }
            });

            // Load the bundled SPA immediately. Cookie bootstrap used to run
            // before this load and could delay first paint by multiple seconds
            // on HarmonyOS/卓易通 when the Bilibili endpoint was slow.
            runOnUiThread(() -> {
                if (webView != null && !isFinishing()) webView.loadUrl(startUrl);
            });
            new Thread(() -> {
                try {
                    // Let the local page and React mount before competing for
                    // network/CPU with the anonymous-cookie request.
                    Thread.sleep(1200);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                if (biliProxy != null) biliProxy.bootstrapCookies();
            }, "biu-bootstrap").start();
        } catch (IOException error) {
            Log.e(TAG, "Unable to start local asset server", error);
            webView.loadData(
                "<html><body style='background:#101014;color:#eee;font-family:sans-serif;padding:30px'>"
                    + "<h2>biu 启动失败</h2><p>无法启动本地资源服务。</p></body></html>",
                "text/html; charset=utf-8",
                "UTF-8"
            );
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        if (backPending) return;
        backPending = true;

        // The Web layer owns layer ordering (Now Playing, dialogs, playlist
        // detail, in-page overlays). It returns "background" when the current
        // route is a top-level tab, so the task is sent home without finishing
        // the Activity: WebView + HTMLAudio stay alive and playback continues.
        webView.evaluateJavascript(
            "(function(){try{return (window.__biuBackPressed&&window.__biuBackPressed())||'fallback'}catch(e){return 'fallback'}})()",
            value -> {
                backPending = false;
                if (value == null || value.equals("null") || value.contains("fallback") || value.contains("background")) {
                    if (!isFinishing()) moveTaskToBack(false);
                }
            }
        );
    }

    private void installSystemInsetsListener() {
        if (webView == null) return;
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            int topPx = 0;
            int bottomPx = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                );
                topPx = bars.top;
                bottomPx = bars.bottom;
            } else {
                topPx = insets.getSystemWindowInsetTop();
                bottomPx = insets.getSystemWindowInsetBottom();
            }
            float density = getResources().getDisplayMetrics().density;
            int topCss = Math.round(topPx / Math.max(1f, density));
            int bottomCss = Math.round(bottomPx / Math.max(1f, density));
            if (topCss != insetTopCss || bottomCss != insetBottomCss) {
                insetTopCss = topCss;
                insetBottomCss = bottomCss;
                injectSafeAreaInsets();
            }
            return insets;
        });
        webView.requestApplyInsets();
    }

    private int fallbackStatusBarCss() {
        int id = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id <= 0) return 24;
        float density = Math.max(1f, getResources().getDisplayMetrics().density);
        return Math.round(getResources().getDimensionPixelSize(id) / density);
    }

    private void injectSafeAreaInsets() {
        if (webView == null) return;
        int top = insetTopCss;
        if (top <= 0) top = fallbackStatusBarCss();
        int bottom = insetBottomCss;
        String js = "document.documentElement.style.setProperty('--biu-inset-top','" + top
            + "px');document.documentElement.style.setProperty('--biu-inset-bottom','" + bottom + "px');";
        webView.evaluateJavascript(js, null);
    }

    /**
     * Normal pages use solid theme-coloured bars. The Now Playing overlay is
     * immersive: it draws its own background behind transparent bars and the
     * web layer pads its controls with --biu-inset-top/bottom.
     */
    private void applySystemBars(boolean light) {
        applySystemBars(light, nowPlayingImmersive);
    }

    private void applySystemBars(boolean light, boolean immersive) {
        lightTheme = light;
        nowPlayingImmersive = immersive;
        int background = light ? LIGHT_BG : DARK_BG;
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(background));

        if (immersive) {
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.setNavigationBarDividerColor(Color.TRANSPARENT);
            }
        } else {
            window.setStatusBarColor(background);
            window.setNavigationBarColor(background);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.setNavigationBarDividerColor(background);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                window.setDecorFitsSystemWindows(!immersive);
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    controller.setSystemBarsAppearance(light ? mask : 0, mask);
                }
            } catch (Throwable ignored) {
                // The decor view may not exist yet on some compatibility containers.
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
            if (immersive) {
                flags |= View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            }
            if (light) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
            }
            window.getDecorView().setSystemUiVisibility(flags);
        }
        if (webView != null) {
            webView.setBackgroundColor(background);
            webView.requestApplyInsets();
            injectSafeAreaInsets();
        }
    }

    @Override
    protected void onPause() {
        // Keep the WebView alive so media-session commands can still reach the player.
        // Cookie persistence can touch disk; never block the UI thread on lock/pause.
        new Thread(() -> {
            try { CookieManager.getInstance().flush(); } catch (Throwable ignored) {}
        }, "biu-cookie-flush").start();
        super.onPause();
    }

    private void notifyWebResume() {
        if (webView == null) return;
        webView.evaluateJavascript(
            "window.__biuAppResumed&&window.__biuAppResumed()",
            null
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        // HarmonyOS/卓易通 may restore default system-bar colors on resume.
        applySystemBars(lightTheme, nowPlayingImmersive);
        if (webView != null) {
            webView.onResume();
            // Let the WebView finish restoring its compositor before syncing the
            // player, so lock-screen unlock does not contend with a large repaint.
            webView.postDelayed(this::notifyWebResume, 180);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && webView != null) {
            webView.postDelayed(this::notifyWebResume, 220);
        }
    }

    @Override
    protected void onDestroy() {
        trustedPage = false;
        if (mediaCommandReceiver != null) {
            try { unregisterReceiver(mediaCommandReceiver); } catch (Exception ignored) {}
            mediaCommandReceiver = null;
        }
        PlaybackNotificationService.stop(this);
        if (assetServer != null) assetServer.stop();
        if (webView != null) {
            webView.removeJavascriptInterface("BiuAndroid");
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void probeStartupPage(int generation) {
        if ((generation >= 0 && generation != pageGeneration)
            || webView == null || isFinishing() || startupFallbackShown) return;
        final String js = "(function(){try{var r=document.getElementById('root');"
            + "return r?(r.childElementCount>0?'ok':'empty'):'missing';}catch(e){return 'error';}})()";
        webView.evaluateJavascript(js, value -> {
            if (webView == null || isFinishing() || startupFallbackShown) return;
            boolean blank = value == null || value.contains("empty") || value.contains("missing") || value.contains("error");
            if (!blank) return;
            Log.w(TAG, "startup probe: page root is empty (" + value + ")");
            if (!startupRecoveryAttempted) {
                startupRecoveryAttempted = true;
                try {
                    // Do not clear the HTTP cache here: on a slow HarmonyOS
                    // WebView a cache clear turns a late first paint into a
                    // second full cold load. A versioned URL reload is enough.
                    String current = webView.getUrl();
                    if (current == null || !current.contains("index.html")) {
                        current = "http://127.0.0.1:" + assetPort
                            + "/index.html?v=" + BuildConfig.VERSION_CODE;
                    }
                    String hash = "";
                    int hashIndex = current.indexOf('#');
                    if (hashIndex >= 0) {
                        hash = current.substring(hashIndex);
                        current = current.substring(0, hashIndex);
                    }
                    webView.loadUrl(current + (current.contains("?") ? "&" : "?") + "recover=1" + hash);
                } catch (Throwable error) {
                    Log.e(TAG, "startup recovery reload failed", error);
                    showStartupError("biu 页面加载为空，重新加载失败。");
                }
                return;
            }
            showStartupError("biu 页面未能正常显示。\n点击“重新加载”重试。");
        });
    }

    private void showStartupError(String message) {
        if (startupFallbackShown) return;
        startupFallbackShown = true;
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(42, 42, 42, 42);
        layout.setBackgroundColor(Color.rgb(16, 16, 20));

        TextView text = new TextView(this);
        text.setText(message);
        text.setTextColor(Color.rgb(235, 235, 240));
        text.setTextSize(16);
        text.setGravity(Gravity.CENTER);
        layout.addView(text);

        Button retry = new Button(this);
        retry.setText("重新加载");
        retry.setTextColor(Color.rgb(28, 28, 30));
        retry.setBackgroundColor(Color.rgb(255, 92, 147));
        retry.setOnClickListener(v -> {
            try {
                recreate();
            } catch (Throwable ignored) {
                finish();
            }
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.topMargin = 28;
        layout.addView(retry, params);
        setContentView(layout);
    }

    private boolean isTrustedPage() {
        return trustedPage && webView != null;
    }

    private void updateTrustedPage(String url) {
        trustedPage = webView != null
            && !appOrigin.isEmpty()
            && url != null
            && url.startsWith(appOrigin + "/");
    }

    private void dispatchMediaCommand(String command) {
        if (webView == null) return;
        String script = "window.__biuMediaCommand&&window.__biuMediaCommand("
            + org.json.JSONObject.quote(command) + ")";
        webView.post(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private void deliverBiliPost(String requestId, String result) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String script = "window.__biuBiliPostResult("
                + org.json.JSONObject.quote(requestId) + ","
                + org.json.JSONObject.quote(result) + ")";
            webView.evaluateJavascript(script, null);
        });
    }

    private String cookieValue(String name) {
        String cookies = CookieManager.getInstance().getCookie("https://api.bilibili.com");
        if (cookies == null) return "";
        for (String pair : cookies.split(";")) {
            String item = pair.trim();
            if (item.startsWith(name + "=")) return item.substring(name.length() + 1);
        }
        return "";
    }

    private String postBili(String path, String body) throws IOException {
        String jct = cookieValue("bili_jct");
        String form = body == null ? "" : body;
        if (!jct.isEmpty()) {
            // CSRF 由原生侧注入，不再通过 JS bridge 暴露给页面脚本。
            String csrf = "csrf=" + URLEncoder.encode(jct, StandardCharsets.UTF_8.name());
            form = form.isEmpty() ? csrf : form + "&" + csrf;
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL("https://api.bilibili.com" + path).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setDoOutput(true);
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; BiuAndroid/"
                + BuildConfig.VERSION_NAME + ") AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36");
            connection.setRequestProperty("Referer", "https://www.bilibili.com/");
            connection.setRequestProperty("Origin", "https://www.bilibili.com");
            connection.setRequestProperty("Accept", "application/json, text/plain, */*");
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            String cookies = CookieManager.getInstance().getCookie("https://api.bilibili.com");
            if (cookies != null && !cookies.isEmpty()) {
                connection.setRequestProperty("Cookie", cookies);
            }

            byte[] payload = form.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload);
            }

            int status = connection.getResponseCode();
            InputStream raw = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] response = raw == null ? new byte[0] : readAll(raw);
            return new String(response, StandardCharsets.UTF_8);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        try (InputStream source = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private final class AndroidBridge {
        @JavascriptInterface
        public String getVersion() {
            return isTrustedPage() ? BuildConfig.VERSION_NAME : "";
        }

        @JavascriptInterface
        public String getCacheDirectory() {
            if (!isTrustedPage()) return "";
            try {
                File root = getFilesDir().getParentFile();
                if (root == null) return getFilesDir().getAbsolutePath();
                return new File(root, "app_webview/Default/IndexedDB").getAbsolutePath();
            } catch (Throwable ignored) {
                return getFilesDir().getAbsolutePath();
            }
        }

        @JavascriptInterface
        public void setSystemTheme(String mode) {
            if (!isTrustedPage()) return;
            boolean light = !"dark".equals(mode);
            runOnUiThread(() -> applySystemBars(light, nowPlayingImmersive));
        }

        @JavascriptInterface
        public void updateMediaSession(String payload) {
            if (!isTrustedPage()) return;
            try {
                PlaybackNotificationService.update(MainActivity.this, payload);
            } catch (Throwable ignored) {
                // Compatibility containers may not allow foreground services.
            }
        }

        @JavascriptInterface
        public void biliPost(final String requestId, final String path, final String body) {
            if (!isTrustedPage() || path == null || !path.startsWith("/x/")) {
                deliverBiliPost(requestId, "{\"code\":-1,\"message\":\"无效的 B 站接口\"}");
                return;
            }
            new Thread(() -> {
                String result;
                try {
                    result = postBili(path, body == null ? "" : body);
                } catch (Exception error) {
                    result = "{\"code\":-1,\"message\":" + org.json.JSONObject.quote(
                        "B 站请求失败：" + (error.getMessage() == null ? "网络错误" : error.getMessage())
                    ) + "}";
                }
                deliverBiliPost(requestId, result);
            }, "biu-bili-post").start();
        }

        @JavascriptInterface
        public void reloadForPlayback() {
            if (!isTrustedPage()) return;
            // HarmonyOS compatibility containers can leave WebView's media /
            // network stack suspended after a long background pause. A page
            // reload keeps the current hash route and forces a clean media
            // engine; the web layer restores the persisted player state.
            runOnUiThread(() -> {
                try {
                    if (webView != null) {
                        webView.onResume();
                        webView.reload();
                    }
                } catch (Throwable ignored) {
                    // The compatibility container may already be tearing down.
                }
            });
        }

        @JavascriptInterface
        public void logout() {
            if (!isTrustedPage()) return;
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
            runOnUiThread(() -> webView.reload());
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (!isTrustedPage() || url == null) return;
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) return;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {
            }
        }
    }
}
