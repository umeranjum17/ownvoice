package com.google.android.gm;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * A Gmail-style lab fixture under Gmail's package id, laid out like the real app's screens as the
 * accessibility service reads them: an open thread (subject, sender, the mail's body, the message's own
 * Reply and a Reply / Reply all / Forward row, no message box) and, with the `screen=inbox` extra, an
 * inbox list with no Reply at all. Reply opens {@link Compose}. Demo data only ("Umer", "Sam Lee"); it
 * never sends and never reaches a network.
 */
public class Mail extends Activity {
  static final String SUBJECT = "Thursday's review";
  static final String SENDER = "Sam Lee";
  static final String BODY = "Hi Umer,\n\nCould we move Thursday's review to Friday at 10? I'd like one more day on the draft numbers. If Friday doesn't work for you, Monday morning is fine too.\n\nThanks,\nSam";

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    boolean inbox = "inbox".equals(getIntent().getStringExtra("screen"));
    LinearLayout root = column(this);
    root.setPadding(0, 120, 0, 0);
    LinearLayout bar = new LinearLayout(this);
    bar.addView(icon(this, android.R.drawable.ic_menu_revert, "Navigate up"));
    bar.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
    if (!inbox) for (String label : new String[] {"Archive", "Delete", "Mark unread"}) bar.addView(icon(this, android.R.drawable.ic_menu_delete, label));
    bar.addView(icon(this, android.R.drawable.ic_menu_more, "More options"));
    root.addView(bar);
    LinearLayout page = column(this);
    page.setPadding(48, 24, 48, 48);
    ScrollView scroll = new ScrollView(this);
    scroll.addView(page);
    root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    if (inbox) {
      page.addView(text(this, "Primary", 15, true));
      row(page, SENDER, SUBJECT, "Hi Umer, could we move Thursday's review to Friday at 10? I'd like one more day on the draft numbers.");
      row(page, "Alex Kim", "Lunch next week", "Are you free for lunch next week? I found a new place near the office.");
      setContentView(root);
      return;
    }
    TextView subject = text(this, SUBJECT, 22, false);
    page.addView(subject);
    LinearLayout from = new LinearLayout(this);
    from.setPadding(0, 40, 0, 24);
    LinearLayout who = column(this);
    who.addView(text(this, SENDER, 16, true));
    who.addView(text(this, "to me · 9:41 AM", 13, false));
    from.addView(who, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    ImageView reply = new ImageView(this);
    reply.setImageResource(android.R.drawable.ic_menu_revert);
    reply.setContentDescription("Reply");
    reply.setPadding(24, 24, 24, 24);
    reply.setOnClickListener(v -> reply());
    from.addView(reply);
    from.addView(icon(this, android.R.drawable.ic_menu_more, "More options"));
    page.addView(from);
    page.addView(text(this, BODY, 16, false));
    LinearLayout actions = new LinearLayout(this);
    actions.setPadding(0, 64, 0, 0);
    for (String label : new String[] {"Reply", "Reply all", "Forward"}) {
      Button button = new Button(this);
      button.setText(label);
      button.setAllCaps(false);
      if (!label.equals("Forward")) button.setOnClickListener(v -> reply());
      actions.addView(button, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    }
    page.addView(actions);
    setContentView(root);
  }

  private void reply() { startActivity(new Intent(this, Compose.class)); }

  private void row(LinearLayout page, String sender, String subject, String snippet) {
    LinearLayout item = column(this);
    item.setPadding(0, 40, 0, 24);
    item.addView(text(this, sender, 16, true));
    item.addView(text(this, subject, 15, false));
    item.addView(text(this, snippet, 14, false));
    page.addView(item);
  }

  static LinearLayout column(Activity activity) {
    LinearLayout layout = new LinearLayout(activity);
    layout.setOrientation(LinearLayout.VERTICAL);
    return layout;
  }

  static TextView text(Activity activity, String value, int size, boolean bold) {
    TextView view = new TextView(activity);
    view.setText(value);
    view.setTextSize(size);
    if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
    view.setTextIsSelectable(false);
    return view;
  }

  static ImageButton icon(Activity activity, int image, String label) {
    ImageButton button = new ImageButton(activity);
    button.setImageResource(image);
    button.setContentDescription(label);
    button.setBackground(null);
    button.setPadding(28, 28, 28, 28);
    return button;
  }
}
