package com.google.android.gm;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;

/**
 * The fixture's reply screen, laid out like Gmail's: From, To, the "Re:" subject, the body box
 * (focused, as Gmail focuses it on Reply) and "Include quoted text", so the original mail is not on
 * this screen. Send is a control a person would see but does nothing here: this lab mail never sends.
 */
public class Compose extends Activity {
  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = Mail.column(this);
    root.setPadding(0, 120, 0, 0);
    LinearLayout bar = new LinearLayout(this);
    ImageButton up = Mail.icon(this, android.R.drawable.ic_menu_revert, "Navigate up");
    up.setOnClickListener(v -> finish());
    bar.addView(up);
    bar.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
    bar.addView(Mail.icon(this, android.R.drawable.ic_menu_add, "Attach files"));
    ImageButton send = Mail.icon(this, android.R.drawable.ic_menu_send, "Send");
    send.setClickable(true);
    bar.addView(send);
    bar.addView(Mail.icon(this, android.R.drawable.ic_menu_more, "More options"));
    root.addView(bar);
    LinearLayout page = Mail.column(this);
    page.setPadding(48, 24, 48, 24);
    page.addView(Mail.text(this, "From   umer@example.com", 15, false));
    LinearLayout to = new LinearLayout(this);
    to.setPadding(0, 32, 0, 16);
    to.addView(Mail.text(this, "To   " + Mail.SENDER, 15, false));
    page.addView(to);
    EditText subject = new EditText(this);
    subject.setText("Re: " + Mail.SUBJECT);
    subject.setSingleLine(true);
    page.addView(subject);
    EditText body = new EditText(this);
    body.setHint("Compose email");
    body.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
    body.setGravity(Gravity.TOP | Gravity.START);
    body.setMinLines(4);
    body.setBackground(null);
    page.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    page.addView(Mail.icon(this, android.R.drawable.ic_menu_more, "Include quoted text"));
    root.addView(page);
    setContentView(root);
    body.requestFocus();
  }
}
