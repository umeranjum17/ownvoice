package dev.ownvoice.demo;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;

/**
 * Grow-mode demo fixture: a full-screen WebView showing local X-style and Reddit-style pages
 * with fictional authors, chosen by the "page" intent extra ("x" or "reddit"). Demo data only
 * ("Umer"); it never posts and never reaches a network. No real logos, wordmarks or handles:
 * captions say "X-style" or "Reddit-style". The page title carries the ?p= hint the demo build
 * maps to X or Reddit; the same words sit in the visible caption as a fallback.
 */
public class Demo extends Activity {
  static final String CSS = "body{font:17px sans-serif;margin:0;padding:16px;background:#fff;color:#111}"
    + "@media (prefers-color-scheme: dark){body{background:#000;color:#e7e9ea}}"
    + ".cap{color:#536471;font-size:13px;margin:0 0 8px}"
    + ".who{font-weight:bold;margin:0 0 4px}.post{font-size:19px;line-height:1.35;margin:0 0 8px}"
    + ".rules{border:1px solid #cfd9de;border-radius:10px;padding:10px;margin:0 0 8px;font-size:15px}"
    + "textarea{display:block;width:100%;box-sizing:border-box;min-height:140px;padding:12px;"
    + "font:17px sans-serif;border:1px solid #999;border-radius:10px;margin-top:20px;background:#fff;color:#111}"
    + "@media (prefers-color-scheme: dark){textarea{background:#000;color:#e7e9ea;border-color:#333}"
    + ".rules{border-color:#333}}.hint{color:#536471;font-size:13px;margin:12px 0 0}";

  static final String X = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
    + "<title>Grow demo?p=x - X-style reply</title><style>" + CSS + "</style></head><body>"
    + "<p class=cap>X-style demo - fictional authors, demo data</p>"
    + "<p class=who>Demo Maker @demo_maker_example - 2h</p>"
    + "<p class=post>Shipping a tiny app every week this year. Week 12: a timer that only counts focused minutes.</p>"
    + "<label for=reply>Your reply</label>"
    + "<textarea id=reply aria-label='Your reply'>Counting only focused minutes is the right call. My timers lie to me by lunch.</textarea>"
    + "<p class=hint>You press Post yourself. Demo data.</p></body></html>";

  static final String REDDIT = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
    + "<title>Grow demo?p=reddit - Reddit-style comment</title><style>" + CSS + "</style></head><body>"
    + "<p class=cap>Reddit-style demo - fictional authors, demo data</p>"
    + "<p class=who>r/demomakers - Demo Maker u/demo_maker_example - 5h</p>"
    + "<p class=post>Week 12: a focus timer that only counts focused minutes. Roast my approach.</p>"
    + "<p class=rules>Community rules: be kind. No self-promotion.</p>"
    + "<label for=reply>Your comment</label>"
    + "<textarea id=reply aria-label='Your comment'>Thanks! I built an app for this, more here https://umerdemo.example.com</textarea>"
    + "<p class=hint>You press Post yourself. Demo data.</p></body></html>";

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    WebView web = new WebView(this);
    setContentView(web);
    web.getSettings().setJavaScriptEnabled(false);
    boolean reddit = "reddit".equals(getIntent().getStringExtra("page"));
    String page = reddit ? "thread?p=reddit" : "post?p=x";
    web.loadDataWithBaseURL("https://demo.local/" + page, reddit ? REDDIT : X, "text/html", "utf-8", null);
  }
}