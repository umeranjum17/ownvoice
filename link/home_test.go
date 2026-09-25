//go:build linux || darwin

package main

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

// The helper must never open the CLIs' sign-in files. Here they are named pipes in directories that can't be listed:
// opening one for reading blocks until a writer comes, so if the helper ever opened one, this test would hang and fail.
func TestTheHelperNeverOpensTheCLIsSignInFiles(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", "")
	for _, f := range []string{".claude/.credentials.json", ".claude/settings.json", ".codex/auth.json", ".codex/config.toml"} {
		p := filepath.Join(home, f)
		os.MkdirAll(filepath.Dir(p), 0o700)
		if err := syscall.Mkfifo(p, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := syscall.Mkfifo(filepath.Join(home, ".claude.json"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{".claude", ".codex"} {
		os.Chmod(filepath.Join(home, d), 0o300) // enter but not list
		t.Cleanup(func() { os.Chmod(filepath.Join(home, d), 0o700) })
	}

	done := make(chan struct{})
	go func() {
		defer close(done)
		base, err := os.UserConfigDir()
		if err != nil {
			t.Error(err)
			return
		}
		r := newRig(t, filepath.Join(base, "ownvoice-link"))
		key := paired(t, r)
		if status, _, _ := call(r.addr, key, r.h.Pin, "/v1/hello", `{}`); status != 200 {
			t.Errorf("hello: %d", status)
		}
		if status, body := write(t, r, key, "", "Ana: shipped it", ""); status != 200 {
			t.Errorf("write: %d %v", status, body)
		}
	}()
	select {
	case <-done:
	case <-time.After(20 * time.Second):
		t.Fatal("the helper blocked opening a sign-in file")
	}
}
