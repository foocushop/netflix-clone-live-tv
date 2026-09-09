package com.example.netflixlivetv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String TAG = "NetflixLiveTV";
    private static final String LOCAL_URL = "file:///android_asset/index.html";
    private static final String APP_URL = "https://netflix-clone-live-tv-j9ta.onrender.com/";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorLayout;
    private TextView errorText;
    private long lastBackPressTime = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Intercepter tout crash au démarrage pour afficher une erreur au lieu de fermer l'app silencieusement
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread t, Throwable e) {
                Log.e(TAG, "Uncaught Exception in thread " + t.getName(), e);
                showFatalCrashScreen(e);
            }
        });

        super.onCreate(savedInstanceState);

        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
            );
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } catch (Throwable ignored) {}

        // Forcer paysage en toute sécurité
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        } catch (Throwable t) {
            Log.w(TAG, "setRequestedOrientation ignored on TV: " + t.getMessage());
        }

        // 1. Root Layout plein écran noir
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#141414"));

        // 2. Écran d'erreur TV avec bouton réactualiser (initialement caché)
        errorLayout = new LinearLayout(this);
        errorLayout.setOrientation(LinearLayout.VERTICAL);
        errorLayout.setGravity(Gravity.CENTER);
        errorLayout.setBackgroundColor(Color.parseColor("#141414"));
        errorLayout.setVisibility(View.GONE);

        errorText = new TextView(this);
        errorText.setTextColor(Color.WHITE);
        errorText.setTextSize(20f);
        errorText.setGravity(Gravity.CENTER);
        errorText.setPadding(40, 20, 40, 30);
        errorText.setText("Connexion impossible à Netflix Live TV.\nVérifiez votre connexion Internet.");
        errorLayout.addView(errorText);

        Button retryBtn = new Button(this);
        retryBtn.setText("Réessayer (OK)");
        retryBtn.setTextColor(Color.WHITE);
        retryBtn.setBackgroundColor(Color.parseColor("#E50914"));
        retryBtn.setTextSize(18f);
        retryBtn.setPadding(40, 20, 40, 20);
        retryBtn.setFocusable(true);
        retryBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hideError();
                if (webView != null) {
                    webView.loadUrl(LOCAL_URL);
                }
            }
        });
        errorLayout.addView(retryBtn);

        FrameLayout.LayoutParams errParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        root.addView(errorLayout, errParams);

        // 3. Barre de progression discrète
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        progressBar.setVisibility(View.VISIBLE);
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, 8
        );
        pbParams.topMargin = 0;
        root.addView(progressBar, pbParams);

        // 4. Initialisation du WebView avec Accélération Matérielle
        try {
            webView = new WebView(this);
            webView.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ));
            webView.setBackgroundColor(Color.parseColor("#141414"));
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.requestFocus();
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }

            // User Agent TV
            String ua = "";
            try {
                ua = settings.getUserAgentString();
            } catch (Throwable ignored) {}
            if (ua == null) ua = "";
            settings.setUserAgentString(ua + " AndroidTV/1.0 NetflixLiveTV");

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return false;
                }

                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    if (progressBar != null) progressBar.setVisibility(View.VISIBLE);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    if (progressBar != null) progressBar.setVisibility(View.GONE);
                    hideSystemUI();
                    if (webView != null) webView.requestFocus();
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request != null && request.isForMainFrame()) {
                        String failingUrl = (request.getUrl() != null) ? request.getUrl().toString() : "";
                        if (failingUrl.startsWith("file:///")) {
                            Log.w(TAG, "Local asset failed, falling back to remote: " + APP_URL);
                            view.loadUrl(APP_URL);
                        } else {
                            showError("Impossible de charger le service.\nVérifiez votre connexion Internet.\n\nURL: " + APP_URL);
                        }
                    }
                }

                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    // Autoriser la connexion sécurisée
                    handler.proceed();
                }
            });

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                    Log.d(TAG, "WebConsole: " + consoleMessage.message());
                    return true;
                }

                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    if (newProgress >= 90 && progressBar != null) {
                        progressBar.setVisibility(View.GONE);
                    }
                }
            });

            root.addView(webView);
            root.bringChildToFront(progressBar);
            root.bringChildToFront(errorLayout);

            setContentView(root);
            webView.loadUrl(LOCAL_URL);

        } catch (Throwable t) {
            Log.e(TAG, "Erreur initialisation WebView", t);
            setContentView(root);
            showFatalCrashScreen(t);
        }

        hideSystemUI();
    }

    private void showError(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (progressBar != null) progressBar.setVisibility(View.GONE);
                if (errorText != null) errorText.setText(message);
                if (errorLayout != null) {
                    errorLayout.setVisibility(View.VISIBLE);
                    errorLayout.bringToFront();
                    errorLayout.requestFocus();
                }
                if (webView != null) webView.setVisibility(View.GONE);
            }
        });
    }

    private void hideError() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (errorLayout != null) errorLayout.setVisibility(View.GONE);
                if (webView != null) {
                    webView.setVisibility(View.VISIBLE);
                    webView.requestFocus();
                }
                if (progressBar != null) progressBar.setVisibility(View.VISIBLE);
            }
        });
    }

    private void showFatalCrashScreen(final Throwable e) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                showError("⚠️ Erreur au démarrage de Netflix Live TV:\n\n" +
                    (e != null ? e.getClass().getSimpleName() + ": " + e.getMessage() : "Inconnue") +
                    "\n\nAssurez-vous que les Services WebView sont à jour sur la TV.");
            }
        });
    }

    private void hideSystemUI() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decor = getWindow().getDecorView();
                if (decor != null) {
                    decor.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    );
                }
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Gestion de la touche RETOUR de la télécommande TV
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN) {
            if (errorLayout != null && errorLayout.getVisibility() == View.VISIBLE) {
                hideError();
                if (webView != null) webView.loadUrl(LOCAL_URL);
                return true;
            }

            if (webView != null) {
                webView.evaluateJavascript(
                    "(function() {" +
                    "  var pm = document.getElementById('netflixPlayer');" +
                    "  if (pm && pm.classList.contains('active')) {" +
                    "    var cb = document.getElementById('playerBackBtn');" +
                    "    if (cb) { cb.click(); return 'player_closed'; }" +
                    "  }" +
                    "  var dm = document.getElementById('detailsModal');" +
                    "  if (dm && dm.classList.contains('active')) {" +
                    "    var mc = document.getElementById('modalCloseBtn');" +
                    "    if (mc) { mc.click(); return 'modal_closed'; }" +
                    "  }" +
                    "  return 'none';" +
                    "})();",
                    new ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String result) {
                            if (result == null || result.equals("\"none\"") || result.equals("null")) {
                                long currentTime = System.currentTimeMillis();
                                if (currentTime - lastBackPressTime < 2500) {
                                    finish();
                                } else {
                                    lastBackPressTime = currentTime;
                                    Toast.makeText(MainActivity.this, "Appuyez à nouveau sur RETOUR pour quitter", Toast.LENGTH_SHORT).show();
                                }
                            }
                        }
                    }
                );
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        if (webView != null) {
            try {
                webView.onResume();
            } catch (Throwable ignored) {}
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            try {
                webView.onPause();
            } catch (Throwable ignored) {}
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (webView != null) {
            try {
                webView.stopLoading();
                webView.destroy();
            } catch (Throwable ignored) {}
        }
    }
}
