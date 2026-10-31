package com.unsunsk8er.biu;

import android.content.res.AssetManager;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Minimal loopback-only HTTP server for the bundled SPA. Using a real http(s)
 * origin keeps localStorage, fetch credentials and the Bilibili API proxy
 * predictable inside Android WebView.
 */
final class LocalAssetServer {
    private static final String TAG = "BiuAndroid";
    private static final int STABLE_PORT = 37699;
    private final AssetManager assets;
    private final String root;
    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile boolean running;

    LocalAssetServer(AssetManager assets, String root) {
        this.assets = assets;
        this.root = root;
    }

    int start() throws IOException {
        InetAddress loopback = InetAddress.getByName("127.0.0.1");
        // WebView localStorage/IndexedDB are isolated by origin (host + port).
        // A random port wiped playlists, favorites and the offline cache on
        // every Android/卓易通 restart, so always prefer the same loopback port.
        try {
            serverSocket = new ServerSocket(STABLE_PORT, 64, loopback);
        } catch (IOException inUse) {
            Log.w(TAG, "Stable asset port " + STABLE_PORT + " unavailable; using an ephemeral port", inUse);
            serverSocket = new ServerSocket(0, 64, loopback);
        }
        running = true;
        acceptThread = new Thread(this::acceptLoop, "biu-assets");
        acceptThread.setDaemon(true);
        acceptThread.start();
        return serverSocket.getLocalPort();
    }

    void stop() {
        running = false;
        try {
            if (serverSocket != null) serverSocket.close();
        } catch (IOException ignored) {
        }
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket socket = serverSocket.accept();
                new Thread(() -> serve(socket), "biu-asset-request").start();
            } catch (IOException error) {
                if (running) {
                    // Keep serving other asset requests.
                }
            }
        }
    }

    private void serve(Socket socket) {
        try (Socket client = socket) {
            client.setSoTimeout(8000);
            client.setTcpNoDelay(true);
            InputStream requestInput = client.getInputStream();
            String requestLine = readLine(requestInput);
            if (requestLine == null) return;
            // Drain the rest of the HTTP request headers. Closing a socket with
            // unread request bytes can make Android/Linux send RST instead of
            // FIN, which used to surface as ERR_CONNECTION_RESET for CSS/JS
            // assets requested in parallel by WebView.
            int headerBytes = 0;
            String headerLine;
            while ((headerLine = readLine(requestInput)) != null && !headerLine.isEmpty()) {
                headerBytes += headerLine.length() + 2;
                if (headerBytes > 16384) break;
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;

            String path = parts[1];
            int query = path.indexOf('?');
            if (query >= 0) path = path.substring(0, query);
            path = URLDecoder.decode(path, StandardCharsets.UTF_8.name());
            if (path.equals("/") || path.isEmpty()) path = "/index.html";
            if (!path.startsWith("/")) path = "/" + path;
            if (path.contains("..")) {
                writeText(client.getOutputStream(), 400, "Bad Request", "bad request");
                return;
            }

            String assetPath = root + path;
            byte[] body;
            try (InputStream assetInput = assets.open(assetPath)) {
                body = readAll(assetInput);
            } catch (IOException missing) {
                writeText(client.getOutputStream(), 404, "Not Found", "not found");
                return;
            }

            String mime = mimeType(path);
            String headers = "HTTP/1.1 200 OK\r\n"
                + "Content-Type: " + mime + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n"
                + "Pragma: no-cache\r\n"
                + "Expires: 0\r\n"
                + "Connection: close\r\n\r\n";
            OutputStream output = new BufferedOutputStream(client.getOutputStream());
            output.write(headers.getBytes(StandardCharsets.UTF_8));
            output.write(body);
            output.flush();
        } catch (Exception ignored) {
        }
    }

    private static String readLine(InputStream input) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int current;
        while ((current = input.read()) != -1) {
            if (current == '\n') break;
            if (current != '\r') out.write(current);
            if (out.size() > 8192) break;
        }
        if (out.size() == 0 && current == -1) return null;
        return out.toString(StandardCharsets.UTF_8.name());
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int count;
        while ((count = input.read(buffer)) != -1) out.write(buffer, 0, count);
        return out.toByteArray();
    }

    private static void writeText(OutputStream output, int status, String reason, String text) throws IOException {
        byte[] body = text.getBytes(StandardCharsets.UTF_8);
        String headers = "HTTP/1.1 " + status + " " + reason + "\r\n"
            + "Content-Type: text/plain; charset=utf-8\r\n"
            + "Content-Length: " + body.length + "\r\n"
            + "Connection: close\r\n\r\n";
        output.write(headers.getBytes(StandardCharsets.UTF_8));
        output.write(body);
        output.flush();
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase(Locale.US);
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".json")) return "application/json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        return "application/octet-stream";
    }
}
