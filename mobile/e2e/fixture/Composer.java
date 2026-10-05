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
 * A blank X-style composer for the own-post proof: the X package id, an empty focused
 * composer and a Post button, so nothing on screen says what the post is about.
 * Demo data only ("Umer"); it never posts and never reaches a network.
 */
public class Composer extends Activity {
  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);
    root.setPadding(32, 190, 32, 32);

    TextView bar = new TextView(this);
    bar.setText("X");
    bar.setTextSize(20);
    bar.setTextColor(Color.BLACK);
    root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    TextView who = new TextView(this);
    who.setText("Posting as Umer");
    who.setTextSize(14);
    who.setTextColor(Color.DKGRAY);
    LinearLayout.LayoutParams whoParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    whoParams.topMargin = 24;
    root.addView(who, whoParams);

    EditText field = new EditText(this);
    field.setHint("What's happening?");
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

    TextView post = new TextView(this);
    post.setText("Post");
    post.setTextSize(16);
    post.setTextColor(Color.WHITE);
    post.setGravity(Gravity.CENTER);
    post.setBackgroundColor(Color.rgb(29, 161, 242));
    post.setPadding(48, 24, 48, 24);
    post.setContentDescription("Post button");
    LinearLayout.LayoutParams postParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    postParams.gravity = Gravity.END;
    postParams.topMargin = 24;
    root.addView(post, postParams);

    setContentView(root);
    // The panel coming to the front can recreate this activity; keeping the typed line across a
    // recreation is what a real composer does, and the proof needs the line to still be there.
    getWindow().getDecorView().post(() -> field.requestFocus());
  }
}