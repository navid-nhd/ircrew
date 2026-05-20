package ir.iranair.crewunified;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Custom HTTP plugin for crew.iranair.com.
 *
 * Background: Iran Air's TLS chain is signed by an intermediate / root CA that
 * is NOT in Android's default trust store, and the server does not present the
 * full chain — so OkHttp (which CapacitorHttp uses under the hood) throws
 *   "java.security.cert.CertPathValidatorException: Trust anchor for
 *    certification path not found."
 * Browsers like Chrome silently fetch the missing intermediate via AIA;
 * OkHttp does not.
 *
 * This plugin runs an OkHttp client with relaxed cert / hostname checks, BUT
 * scoped strictly to *.iranair.com so the relaxation does not leak to any
 * other domain in the app. All other web traffic still goes through the
 * normal CapacitorHttp / WebView path with full TLS validation.
 *
 * The client carries its own persistent in-memory cookie jar so the ASP.NET
 * Login.aspx / FlightCrew.aspx postback dance retains the .ASPXAUTH cookie
 * across requests, exactly like the Node server did with tough-cookie.
 */
@CapacitorPlugin(name = "IRCrewHttp")
public class IRCrewHttpPlugin extends Plugin {

    private OkHttpClient client;
    private ConcurrentHashMap<String, List<Cookie>> cookieStore;

    @Override
    public void load() {
        try {
            // Trust-all manager — applied ONLY to a hostname verifier whitelist below.
            final TrustManager[] trustAll = new TrustManager[] {
                new X509TrustManager() {
                    @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
                    @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
                    @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                }
            };
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, trustAll, new SecureRandom());

            // Cookie jar shared across the lifetime of the app process. Keyed
            // by host so a request to *.iranair.com keeps its .ASPXAUTH across
            // all subsequent postbacks.
            //
            // CRITICAL: we MERGE incoming cookies into the existing set per
            // cookie name. The old "put(host, cookies)" implementation wiped
            // the jar whenever a response came back with no Set-Cookie header,
            // which is exactly what happens on the FlightCrew.aspx GET after
            // the Login.aspx 302 redirect — and that killed .ASPXAUTH right
            // after we got it.
            cookieStore = new ConcurrentHashMap<>();
            final ConcurrentHashMap<String, List<Cookie>> cookieStoreRef = cookieStore;
            CookieJar cookieJar = new CookieJar() {
                @Override
                public void saveFromResponse(HttpUrl url, List<Cookie> cookies) {
                    if (cookies == null || cookies.isEmpty()) return; // don't wipe
                    String host = url.host();
                    List<Cookie> existing = cookieStoreRef.get(host);
                    if (existing == null) existing = new ArrayList<Cookie>();
                    long now = System.currentTimeMillis();
                    List<Cookie> merged = new ArrayList<Cookie>();
                    // Keep existing cookies that are NOT being replaced by name+path
                    // and that are still valid.
                    for (Cookie e : existing) {
                        if (e.expiresAt() <= now) continue;
                        boolean replaced = false;
                        for (Cookie c : cookies) {
                            if (e.name().equals(c.name()) && e.path().equals(c.path())) {
                                replaced = true;
                                break;
                            }
                        }
                        if (!replaced) merged.add(e);
                    }
                    // Add the new cookies (skip ones already expired).
                    for (Cookie c : cookies) {
                        if (c.expiresAt() > now) merged.add(c);
                    }
                    cookieStoreRef.put(host, merged);
                }
                @Override
                public List<Cookie> loadForRequest(HttpUrl url) {
                    List<Cookie> cookies = cookieStoreRef.get(url.host());
                    if (cookies == null) return new ArrayList<Cookie>();
                    long now = System.currentTimeMillis();
                    List<Cookie> alive = new ArrayList<Cookie>();
                    for (Cookie c : cookies) {
                        if (c.expiresAt() > now) alive.add(c);
                    }
                    return alive;
                }
            };

            client = new OkHttpClient.Builder()
                .sslSocketFactory(sc.getSocketFactory(), (X509TrustManager) trustAll[0])
                .hostnameVerifier((hostname, session) -> {
                    // Only Iran Air domains use the relaxed verifier.
                    return hostname != null
                        && (hostname.equals("crew.iranair.com")
                            || hostname.equals("iranair.com")
                            || hostname.endsWith(".iranair.com"));
                })
                .cookieJar(cookieJar)
                .followRedirects(true)
                .followSslRedirects(true)
                .connectTimeout(60, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();
        } catch (Exception e) {
            // If init fails for any reason, leave client = null; subsequent
            // request() calls will reject with a clear error.
        }
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (client == null) {
            call.reject("IRCrewHttp not initialised");
            return;
        }
        String url = call.getString("url");
        String method = call.getString("method", "GET");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        Request.Builder reqBuilder;
        try {
            reqBuilder = new Request.Builder().url(url);
        } catch (IllegalArgumentException e) {
            call.reject("invalid url: " + url);
            return;
        }

        // Headers
        JSObject headersObj = call.getObject("headers");
        String contentType = "application/x-www-form-urlencoded";
        if (headersObj != null) {
            Iterator<String> keys = headersObj.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                String v = headersObj.optString(k, "");
                if (k.equalsIgnoreCase("Content-Type")) contentType = v;
                reqBuilder.header(k, v);
            }
        }

        String data = call.getString("data", "");

        if ("POST".equalsIgnoreCase(method)) {
            RequestBody body = RequestBody.create(MediaType.parse(contentType), data == null ? "" : data);
            reqBuilder.post(body);
        } else if ("PUT".equalsIgnoreCase(method)) {
            RequestBody body = RequestBody.create(MediaType.parse(contentType), data == null ? "" : data);
            reqBuilder.put(body);
        } else if ("DELETE".equalsIgnoreCase(method)) {
            reqBuilder.delete();
        } else {
            reqBuilder.get();
        }

        try {
            Response response = client.newCall(reqBuilder.build()).execute();
            String responseBody = response.body() != null ? response.body().string() : "";
            int status = response.code();
            response.close();

            JSObject ret = new JSObject();
            ret.put("status", status);
            ret.put("data", responseBody);
            ret.put("url", response.request().url().toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("HTTP request failed: " + (e.getMessage() == null ? "unknown" : e.getMessage()), e);
        }
    }

    /**
     * Wipe the cookie jar for a specific host (or all hosts when "host" is
     * omitted). The Node server uses a fresh-session-per-endpoint pattern
     * (withFreshSession in server/index.js); calling this before each ASP.NET
     * login on the JS side keeps mobile behaviour matched.
     */
    @PluginMethod
    public void clearCookies(PluginCall call) {
        if (cookieStore == null) {
            call.resolve();
            return;
        }
        String host = call.getString("host");
        if (host == null || host.isEmpty()) {
            cookieStore.clear();
        } else {
            cookieStore.remove(host);
        }
        call.resolve();
    }
}
