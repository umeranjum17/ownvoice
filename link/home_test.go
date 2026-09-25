//go:build linux || darwin

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io/fs"
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

// treeHash hashes every file's path, mode and contents under root.
func treeHash(t *testing.T, root string) string {
	h := sha256.New()
	filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			t.Fatal(err)
		}
		fi, _ := d.Info()
		fmt.Fprintf(h, "%s %v %d\n", p, fi.Mode(), fi.ModTime().UnixNano())
		if d.Type().IsRegular() {
			b, _ := os.ReadFile(p)
			h.Write(b)
		}
		return nil
	})
	return hex.EncodeToString(h.Sum(nil))
}

// Real use runs the helper's own claude invocation path under the person's HOME, so it must leave the CLIs'
// config, sessions and sign-ins exactly as they were. Here HOME is a sandbox seeded with a made-up copy of them.
func TestRealUseLeavesTheCLIsConfigUnchanged(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", "")
	for f, body := range map[string]string{
		".claude/.credentials.json":         `{"claudeAiOauth":{"accessToken":"made-up"}}`,
		".claude/settings.json":             `{"hooks":{}}`,
		".claude/CLAUDE.md":                 "house rules",
		".claude/projects/-x/session.jsonl": "{}",
		".claude.json":                      `{"numStartups":1}`,
		".codex/auth.json":                  `{"tokens":"made-up"}`,
		".codex/config.toml":                "model = \"x\"",
	} {
		p := filepath.Join(home, f)
		os.MkdirAll(filepath.Dir(p), 0o700)
		os.WriteFile(p, []byte(body), 0o600)
	}
	before := map[string]string{}
	for _, d := range []string{".claude", ".claude.json", ".codex"} {
		before[d] = treeHash(t, filepath.Join(home, d))
	}
	base, _ := os.UserConfigDir()
	r := newRig(t, filepath.Join(base, "ownvoice-link"))
	key := paired(t, r)
	for _, mode := range []string{"", "limit", "prose"} {
		write(t, r, key, mode, "Ana: shipped it", "No em dashes.")
	}
	for d, h := range before {
		if got := treeHash(t, filepath.Join(home, d)); got != h {
			t.Errorf("%s changed", d)
		}
	}
}
