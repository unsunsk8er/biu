package com.unsunsk8er.biu;

import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * WebView request interceptor for Bilibili API/passport requests.
 *
 * The web renderer can keep using its existing browser fetch fallback, while
 * this class supplies the cookies, Referer and permissive CORS headers that a
 * normal file:// or localhost WebView cannot provide. Account cookies never
 * leave Android's CookieManager.
 */
final class BiliProxy {
    // Bilibili's WBI/reply APIs return -352 for the custom BiuAndroid UA.
    // Use a normal desktop Chrome UA for API requests; the WebView page UA is
    // still set separately to BiuAndroid for mobile layout detection.
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
    // Bilibili's media CDN rejects the Android WebView UA with 403; its signed
    // audio URLs expect a desktop browser UA. The app is still Android-only.
    private static final String MEDIA_USER_AGENT =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
            + "Chrome/136.0.0.0 Safari/537.36";

    private final String appOrigin;

    BiliProxy(String appOrigin) {
        this.appOrigin = appOrigin;
    }

    void bootstrapCookies() {
        HttpURLConnection connection = null;
        boolean streamed = false;
        try {
            String existing = CookieManager.getInstance().getCookie("https://api.bilibili.com");
            if (existing == null || !existing.contains("buvid3=")) {
                HttpURLConnection fingerprint = null;
                try {
                    fingerprint = (HttpURLConnection) new URL("https://api.bilibili.com/x/frontend/finger/spi").openConnection();
                    fingerprint.setConnectTimeout(8000);
                    fingerprint.setReadTimeout(8000);
                    fingerprint.setRequestProperty("User-Agent", MEDIA_USER_AGENT);
                    fingerprint.setRequestProperty("Referer", "https://www.bilibili.com/");
                    int status = fingerprint.getResponseCode();
                    if (status == 200) {
                        byte[] body = readAll(fingerprint.getInputStream());
                        org.json.JSONObject root = new org.json.JSONObject(new String(body, StandardCharsets.UTF_8));
                        org.json.JSONObject data = root.optJSONObject("data");
                        if (root.optInt("code") == 0 && data != null) {
                            String b3 = data.optString("b_3", "");
                            String b4 = data.optString("b_4", "");
                            if (!b3.isEmpty()) {
                                CookieManager.getInstance().setCookie(
                                    "https://www.bilibili.com/",
                                    "buvid3=" + b3 + "; Domain=.bilibili.com; Path=/; Secure"
                                );
                            }
                            if (!b4.isEmpty()) {
                                CookieManager.getInstance().setCookie(
                                    "https://www.bilibili.com/",
                                    "buvid4=" + b4 + "; Domain=.bilibili.com; Path=/; Secure"
                                );
                            }
                            CookieManager.getInstance().flush();
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    if (fingerprint != null) fingerprint.disconnect();
                }
            }
            connection = (HttpURLConnection) new URL("https://www.bilibili.com/").openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9");
            connection.getResponseCode();
            Map<String, List<String>> headers = connection.getHeaderFields();
            if (headers != null) {
                for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                    if (entry.getKey() == null || !"Set-Cookie".equalsIgnoreCase(entry.getKey())) continue;
                    for (String value : entry.getValue()) {
                        CookieManager.getInstance().setCookie("https://www.bilibili.com/", value);
                    }
                }
                CookieManager.getInstance().flush();
            }
        } catch (Exception ignored) {
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    WebResourceResponse intercept(WebResourceRequest request) {
        String url = request.getUrl().toString();
        String host = request.getUrl().getHost();
        if (host == null) return null;
        boolean biliApi = host.equals("api.bilibili.com");
        boolean biliPassport = host.equals("passport.bilibili.com");
        boolean biliImage = host.endsWith(".hdslb.com") || host.endsWith(".biliimg.com");
        boolean biliMedia = host.endsWith(".bilivideo.com") || host.endsWith(".bilivideo.cn");
        boolean coverApi = host.equals("music.163.com")
            || host.equals("c.y.qq.com")
            || host.equals("itunes.apple.com")
            || host.equals("songsearch.kugou.com");
        boolean lyricsApi = host.equals("www.oiapi.net") || host.endsWith(".oiapi.net");
        boolean thirdPartyApi = coverApi || lyricsApi;
        if (!biliApi && !biliPassport && !biliImage && !biliMedia && !thirdPartyApi) return null;

        String method = request.getMethod();
        if ("OPTIONS".equalsIgnoreCase(method)) {
            return new WebResourceResponse(
                "text/plain", "UTF-8", 204, "No Content", corsHeaders(), new ByteArrayInputStream(new byte[0])
            );
        }
        if (!"GET".equalsIgnoreCase(method)) {
            return jsonError(405, "biu Android 只代理 B 站 GET 接口");
        }

        HttpURLConnection connection = null;
        boolean streamed = false;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            String thirdPartyReferer = host.equals("music.163.com")
                ? "https://music.163.com/"
                : host.equals("c.y.qq.com")
                    ? "https://y.qq.com/"
                    : host.equals("songsearch.kugou.com")
                        ? "https://www.kugou.com/"
                        : host.equals("itunes.apple.com")
                        ? "https://www.apple.com/"
                        : lyricsApi ? "https://www.oiapi.net/" : "https://www.bilibili.com/";
            connection.setRequestProperty("User-Agent", biliMedia || thirdPartyApi ? MEDIA_USER_AGENT : USER_AGENT);
            connection.setRequestProperty("Referer", thirdPartyApi ? thirdPartyReferer : "https://www.bilibili.com/");
            // QQ Music returns HTTP 400 when an Origin header is present.
            // The WebView's origin is localhost anyway; only Bilibili needs an Origin.
            if (!thirdPartyApi) {
                connection.setRequestProperty("Origin", "https://www.bilibili.com");
            }
            connection.setRequestProperty("Accept", biliImage
                ? "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
                : biliMedia ? "*/*" : "application/json, text/plain, */*");
            connection.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.5");
            if (biliMedia) {
                // Keep audio byte ranges unmodified; transparent gzip breaks seeking.
                connection.setRequestProperty("Accept-Encoding", "identity");
            }
            String range = request.getRequestHeaders().get("Range");
            if (range != null && !range.isEmpty()) {
                connection.setRequestProperty("Range", range);
            }

            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) {
                connection.setRequestProperty("Cookie", cookie);
            }

            int status = connection.getResponseCode();
            Map<String, List<String>> responseHeaders = connection.getHeaderFields();
            if (responseHeaders != null) {
                for (Map.Entry<String, List<String>> entry : responseHeaders.entrySet()) {
                    String name = entry.getKey();
                    if (name == null || !"Set-Cookie".equalsIgnoreCase(name)) continue;
                    for (String value : entry.getValue()) {
                        CookieManager.getInstance().setCookie(url, value);
                    }
                }
                CookieManager.getInstance().flush();
            }

            String contentType = connection.getHeaderField("Content-Type");
            String mime = "application/json";
            String encoding = "UTF-8";
            if (contentType != null) {
                String[] pieces = contentType.split(";", 2);
                mime = pieces[0].trim();
                for (int i = 1; i < pieces.length; i++) {
                    String piece = pieces[i].trim();
                    if (piece.toLowerCase(Locale.US).startsWith("charset=")) {
                        encoding = piece.substring("charset=".length()).trim();
                    }
                }
            }

            Map<String, String> headers = corsHeaders();
            headers.put("Content-Type", contentType != null ? contentType : (biliImage ? "image/jpeg" : "application/octet-stream"));
            headers.put("Cache-Control", biliImage || biliMedia ? "public, max-age=3600" : "no-store");
            String contentRange = connection.getHeaderField("Content-Range");
            if (contentRange != null) headers.put("Content-Range", contentRange);
            String acceptRanges = connection.getHeaderField("Accept-Ranges");
            headers.put("Accept-Ranges", acceptRanges != null ? acceptRanges : "bytes");
            String contentLength = connection.getHeaderField("Content-Length");
            if (contentLength != null) headers.put("Content-Length", contentLength);

            // Audio/video must be streamed. Reading the complete body here made
            // WebView receive one buffered range at a time (and sometimes only
            // the first 1-3 seconds), after which playback appeared to pause.
            if (biliMedia && status < 400) {
                final HttpURLConnection streamingConnection = connection;
                InputStream media = connection.getInputStream();
                InputStream wrapped = new FilterInputStream(media) {
                    @Override
                    public void close() throws IOException {
                        try {
                            super.close();
                        } finally {
                            streamingConnection.disconnect();
                        }
                    }
                };
                streamed = true;
                return new WebResourceResponse(
                    mime, encoding, status, reason(status), headers, wrapped
                );
            }

            InputStream raw = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] body = raw == null ? new byte[0] : readAll(raw);
            return new WebResourceResponse(mime, encoding, status, reason(status), headers, new ByteArrayInputStream(body));
        } catch (Exception error) {
            return jsonError(502, "B 站请求失败：" + error.getMessage());
        } finally {
            if (connection != null && !streamed) connection.disconnect();
        }
    }

    private WebResourceResponse jsonError(int status, String message) {
        byte[] body = ("{\"code\":-1,\"message\":" + quote(message) + "}").getBytes(StandardCharsets.UTF_8);
        Map<String, String> headers = corsHeaders();
        headers.put("Content-Type", "application/json; charset=utf-8");
        return new WebResourceResponse("application/json", "UTF-8", status, reason(status), headers, new ByteArrayInputStream(body));
    }

    private Map<String, String> corsHeaders() {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Access-Control-Allow-Origin", appOrigin);
        headers.put("Access-Control-Allow-Credentials", "true");
        headers.put("Access-Control-Allow-Methods", "GET, OPTIONS");
        headers.put("Access-Control-Allow-Headers", "Content-Type, Accept, Range, Origin, Referer");
        headers.put("Access-Control-Expose-Headers", "Content-Type, Content-Length");
        headers.put("Vary", "Origin");
        return headers;
    }

    private static String reason(int status) {
        if (status == 200) return "OK";
        if (status == 204) return "No Content";
        if (status == 206) return "Partial Content";
        if (status == 404) return "Not Found";
        if (status == 405) return "Method Not Allowed";
        if (status == 502) return "Bad Gateway";
        return "Response";
    }

    private static String quote(String value) {
        return "\"" + String.valueOf(value).replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static byte[] readAll(InputStream input) throws Exception {
        try (InputStream source = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = source.read(buffer)) != -1) out.write(buffer, 0, count);
            return out.toByteArray();
        }
    }
}
