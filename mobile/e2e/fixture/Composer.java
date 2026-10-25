package com.twitter.android;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * An X-style composer fixture: the X package id, a composer field and a Post button. With no
 * extras it is the blank own-post composer. With a `post` extra it shows a feed post above the
 * field and prefills the field from `replyText`, the grow-mode reply case (a typed reply under a
 * post). `text` prefills the blank composer (notes pasted into a new post). `feed` shows a scrolling
 * feed of posts with no box at all, the "Worth a reply?" screen. `label` renames the top bar for the
 * Reddit variant. Demo data only ("Umer"); it never posts and never reaches a network.
 */
public class Composer extends Activity {
  /** The posts a `feed` screen shows, author line then body, as a real feed lays them out. The middle one is the
   *  question the E2E writer's fixed lines answer, so a shot shows a reply that fits the post it was opened for. */
  private static final String[][] FEED = {
    {"Umer Demo @umerdemo · 2h", "Shipped the break reminder today: a quiet sound now, no popup."},
    {"Sam Rivera @samrivera · 4h", "Still on for Saturday? I can bring the stove if you get the tent."},
    {"Ada Lin @adalin · 6h", "What a week. So grateful to this community. Thoughts?"},
  };

  private TextView line(String text, int size, int color, int top) {
    TextView view = new TextView(this);
    view.setText(text);
    view.setTextSize(size);
    view.setTextColor(color);
    LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    params.topMargin = top;
    view.setLayoutParams(params);
    return view;
  }

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    String post = getIntent().getStringExtra("post");
    String replyText = getIntent().getStringExtra("replyText");
    String label = getIntent().getStringExtra("label");
    boolean replying = post != null || getIntent().getBooleanExtra("reply", false);

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);
    root.setPadding(32, 190, 32, 32);

    TextView bar = new TextView(this);
    bar.setText(label != null ? label : "X");
    bar.setTextSize(20);
    bar.setTextColor(Color.BLACK);
    root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    // The feed screen: posts only, no box, which is where one tap rates every post on screen.
    if (getIntent().getBooleanExtra("feed", false)) {
      for (String[] item : FEED) {
        root.addView(line(item[0], 13, Color.DKGRAY, 28));
        root.addView(line(item[1], 18, Color.BLACK, 8));
      }
      setContentView(root);
      return;
    }

    TextView who = new TextView(this);
    who.setText(replying ? "Replying to Umer Demo" : "Posting as Umer");
    who.setTextSize(14);
    who.setTextColor(Color.DKGRAY);
    LinearLayout.LayoutParams whoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    whoParams.topMargin = 24;
    root.addView(who, whoParams);

    EditText field = new EditText(this);
    field.setHint("What's happening?");
    if (replying) {
      TextView parent = new TextView(this);
      parent.setText(post != null ? post : "Umer keeps notes offline to stay focused.");
      parent.setTextColor(Color.BLACK);
      parent.setTextSize(19);
      LinearLayout.LayoutParams parentParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      parentParams.topMargin = 16;
      root.addView(parent, parentParams);
      field.setText(replyText != null ? replyText : "I keep my notes at https://example.com.");
    } else if (getIntent().getStringExtra("text") != null) {
      field.setText(getIntent().getStringExtra("text"));
    }
    field.setTextSize(18);
    field.setTextColor(Color.BLACK);
    field.setHintTextColor(Color.GRAY);
    field.setGravity(Gravity.TOP | Gravity.START);
    field.setBackgroundColor(Color.WHITE);
    field.setContentDescription("Post text");
    field.setFreezesText(true);
    LinearLayout.LayoutParams fieldParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
    fieldParams.topMargin = 24;
    root.addView(field, fieldParams);
    // The composer is focused but the keyboard stays closed, exactly like the practice chat's field.
    field.setFocusableInTouchMode(true);
    field.requestFocus();

    TextView postButton = new TextView(this);
    postButton.setText(replying ? "Reply" : "Post");
    postButton.setTextSize(16);
    postButton.setTextColor(Color.WHITE);
    postButton.setGravity(Gravity.CENTER);
    postButton.setBackgroundColor(Color.rgb(29, 161, 242));
    postButton.setPadding(48, 24, 48, 24);
    postButton.setContentDescription("Post button");
    // Clickable like a real one, so the insert note says to send it yourself; a tap posts nothing.
    postButton.setOnClickListener(v -> { });
    LinearLayout.LayoutParams postParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    postParams.gravity = Gravity.END;
    postParams.topMargin = 24;
    root.addView(postButton, postParams);

    setContentView(root);
    // The panel coming to the front can recreate this activity; keeping the typed line across a
    // recreation is what a real composer does, and the proof needs the line to still be there.
    getWindow().getDecorView().post(() -> field.requestFocus());
  }
}
