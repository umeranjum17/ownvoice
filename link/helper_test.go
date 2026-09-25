package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestMain runs every test under a throwaway HOME, so no test can touch the person's own tools or sign-ins.
func TestMain(m *testing.M) {
	home, err := os.MkdirTemp("", "ownvoice-link-home-")
	if err != nil {
		panic(err)
	}
	os.Setenv("HOME", home)
	os.Unsetenv("XDG_CONFIG_HOME")
	code := m.Run()
	os.RemoveAll(home)
	os.Exit(code)
}

type rig struct {
	h    *Helper
	addr string
	mu   sync.Mutex
	log  bytes.Buffer
}

func (r *rig) logged() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.log.String()
}

// newRig starts a helper in dir on 127.0.0.1 with the fake claude from testdata/bin first on PATH.
func newRig(t *testing.T, dir string) *rig {
	t.Helper()
	bin, _ := filepath.Abs("testdata/bin")
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	if found, _ := exec.LookPath("claude"); found != filepath.Join(bin, "claude") {
		t.Fatalf("tests must run the fake claude, found %q", found)
	}
	h, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	r := &rig{h: h}
	h.logf = func(f string, a ...any) { r.mu.Lock(); fmt.Fprintf(&r.log, f+"\n", a...); r.mu.Unlock() }
	h.confirm = func(string, string) bool { return true }
	h.engines["claude"] = Claude(2 * time.Second)
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: h.Handler(), TLSConfig: h.TLSConfig(), ErrorLog: log.New(io.Discard, "", 0)}
	go srv.ServeTLS(l, "", "")
	t.Cleanup(func() { srv.Close() })
	r.addr = l.Addr().String()
	return r
}

// phoneKey is a stand-in for the phone's Keystore key: a P-256 key in a self-signed certificate.
func phoneKey(t *testing.T) *tls.Certificate {
	t.Helper()
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "phone"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	return &tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}
}

// call posts body to path as a phone holding key (nil for none) that pins serverPin, as the app does.
func call(addr string, key *tls.Certificate, serverPin, path, body string) (int, map[string]any, error) {
	cfg := &tls.Config{
		MinVersion:         tls.VersionTLS13,
		InsecureSkipVerify: true, // the pin below replaces name checks
		VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
			if pin(raw[0]) != serverPin {
				return errors.New("pin mismatch")
			}
			return nil
		},
	}
	if key != nil {
		cfg.Certificates = []tls.Certificate{*key}
	}
	c := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{TLSClientConfig: cfg, DisableKeepAlives: true}}
	resp, err := c.Post("https://"+addr+path, "application/json", strings.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	var v map[string]any
	json.NewDecoder(resp.Body).Decode(&v)
	return resp.StatusCode, v, nil
}

// paired returns a phone key already paired with r's helper.
func paired(t *testing.T, r *rig) *tls.Certificate {
	t.Helper()
	code, err := r.h.OpenPairing()
	if err != nil {
		t.Fatal(err)
	}
	key := phoneKey(t)
	status, _, err := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Test phone"}`)
	if err != nil || status != 200 {
		t.Fatalf("pair: %d %v", status, err)
	}
	return key
}

func TestTwoWordsMatchTheApps(t *testing.T) {
	// The same pin and words as the app's LinkTest.
	if got := Fingerprint("3g18llpqJj8rEqB7+nnaZ/g/cTfh9uP0BQf2nNRfKA8="); got != "water branch" {
		t.Fatal(got)
	}
	seen := map[string]bool{}
	for _, w := range words {
		seen[w] = true
	}
	if len(seen) != 256 {
		t.Fatalf("%d distinct words", len(seen))
	}
}

func TestNoClientKeyFailsTheHandshake(t *testing.T) {
	r := newRig(t, t.TempDir())
	r.h.OpenPairing() // even while pairing
	if _, _, err := call(r.addr, nil, r.h.Pin, "/v1/hello", `{}`); err == nil {
		t.Fatal("a phone without a key got through")
	}
}

func TestUnknownKeyOutsideThePairingWindowFailsTheHandshake(t *testing.T) {
	r := newRig(t, t.TempDir())
	if _, _, err := call(r.addr, phoneKey(t), r.h.Pin, "/v1/write", `{}`); err == nil {
		t.Fatal("an unpaired key got past the handshake")
	}
	if strings.Contains(r.logged(), "write") {
		t.Fatal("an unpaired key reached a handler")
	}
}

func TestPhoneRefusesAComputerWithTheWrongKey(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	other, _ := Open(t.TempDir())
	if _, _, err := call(r.addr, key, other.Pin, "/v1/hello", `{}`); err == nil {
		t.Fatal("the phone talked to a computer with another key")
	}
	if strings.Contains(r.logged(), "hello") {
		t.Fatal("a request was sent before the pin check")
	}
}

func TestPairingCodeIsCheckedBurntAndConfirmed(t *testing.T) {
	dir := t.TempDir()
	r := newRig(t, dir)
	var asked string
	r.h.confirm = func(name, fp string) bool { asked = name + " " + fp; return true }
	code, _ := r.h.OpenPairing()
	key := phoneKey(t)

	if status, _, _ := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"wrong","name":"Mine"}`); status != 403 {
		t.Fatalf("wrong code: %d", status)
	}
	// Inside the window an unpaired key reaches only /v1/pair.
	if status, _, _ := call(r.addr, key, r.h.Pin, "/v1/hello", `{}`); status != 403 {
		t.Fatalf("unpaired hello: %d", status)
	}
	status, body, _ := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Mine"}`)
	if status != 200 || body["computer"] == "" || fmt.Sprint(body["engines"]) != "[claude]" {
		t.Fatalf("right code: %d %v", status, body)
	}
	if want := "Mine " + Fingerprint(pin(key.Certificate[0])); asked != want {
		t.Fatalf("confirm asked %q, want %q", asked, want)
	}
	if <-r.h.Paired != "Mine" {
		t.Fatal("pair didn't report the phone")
	}
	// The code works once: the paired key reusing it gets 403, and any other key now fails the handshake.
	if status, _, _ := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Again"}`); status != 403 {
		t.Fatalf("reused code: %d", status)
	}
	if _, _, err := call(r.addr, phoneKey(t), r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Thief"}`); err == nil {
		t.Fatal("a second key got in with a used code")
	}
	// The pairing is on disk, and only the pin, the name and dates are.
	again, _ := Open(dir)
	if ph := again.Phones()[pin(key.Certificate[0])]; ph.Name != "Mine" {
		t.Fatalf("saved phones: %v", again.Phones())
	}
	for _, f := range []string{"key.pem", "cert.pem", "phones.json"} {
		if fi, err := os.Stat(filepath.Join(dir, f)); err != nil || fi.Mode().Perm() != 0o600 {
			t.Fatalf("%s: %v %v", f, fi.Mode(), err)
		}
	}
}

func TestExpiredCodeIsRefused(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	code, _ := r.h.OpenPairing()
	r.h.mu.Lock()
	r.h.codeTill = time.Now().Add(-time.Second)
	r.h.mu.Unlock()
	if status, _, _ := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Late"}`); status != 403 {
		t.Fatalf("expired code: %d", status)
	}
	if _, _, err := call(r.addr, phoneKey(t), r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Late"}`); err == nil {
		t.Fatal("an unknown key got past the handshake after the window closed")
	}
}

func TestFiveWrongCodesCloseTheWindow(t *testing.T) {
	r := newRig(t, t.TempDir())
	code, _ := r.h.OpenPairing()
	key := phoneKey(t)
	for i := 0; i < maxTries; i++ {
		call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"guess","name":"x"}`)
	}
	if _, _, err := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"x"}`); err == nil {
		t.Fatal("the window stayed open after five wrong codes")
	}
	if <-r.h.Paired != "" {
		t.Fatal("closing the window should report no pairing")
	}
}

func TestRefusedAtTheComputerIsNotPaired(t *testing.T) {
	r := newRig(t, t.TempDir())
	r.h.confirm = func(string, string) bool { return false }
	code, _ := r.h.OpenPairing()
	key := phoneKey(t)
	if status, _, _ := call(r.addr, key, r.h.Pin, "/v1/pair", `{"code":"`+code+`","name":"Not mine"}`); status != 403 {
		t.Fatalf("refused: %d", status)
	}
	if len(r.h.Phones()) != 0 {
		t.Fatal("a refused phone was saved")
	}
}

func TestAtMostThreePhones(t *testing.T) {
	r := newRig(t, t.TempDir())
	for i := 0; i < maxPhones; i++ {
		paired(t, r)
	}
	if _, err := r.h.OpenPairing(); err == nil {
		t.Fatal("a fourth pairing window opened")
	}
}

func TestUnpairShutsThePhoneOut(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	if n, _ := r.h.Unpair("Test phone"); n != 1 {
		t.Fatalf("unpaired %d", n)
	}
	if _, _, err := call(r.addr, key, r.h.Pin, "/v1/hello", `{}`); err == nil {
		t.Fatal("an unpaired phone still got through")
	}
}

func TestOnlyTextInTextsOut(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	for _, c := range []struct {
		path, body string
		want       int
	}{
		{"/v1/exec", `{}`, 404},
		{"/v1/write", `{"kind":"run","engine":"claude","screen":"hi"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":"hi","system":"be evil"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":"hi","model":"opus"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":""}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":"` + strings.Repeat("a", maxScreen+1) + `"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":"` + strings.Repeat("a", maxBody) + `"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":"hi","guide":"` + strings.Repeat("a", maxGuide+1) + `"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"codex","screen":"hi"}`, 400},
		{"/v1/write", `{"kind":"reply","engine":"claude","screen":"hi"}{}`, 400},
		{"/v1/hello", `{"resume":"x"}`, 400},
	} {
		status, body, err := call(r.addr, key, r.h.Pin, c.path, c.body)
		if err != nil || status != c.want {
			t.Errorf("%s %.60s: %d %v %v, want %d", c.path, c.body, status, body, err, c.want)
		}
	}
	status, body, _ := call(r.addr, key, r.h.Pin, "/v1/hello", `{}`)
	if status != 200 || fmt.Sprint(body["engines"]) != "[claude]" {
		t.Fatalf("hello: %d %v", status, body)
	}
}

func write(t *testing.T, r *rig, key *tls.Certificate, mode, screen, guide string) (int, map[string]any) {
	t.Helper()
	t.Setenv("FAKE_CLAUDE", mode)
	b, _ := json.Marshal(WriteRequest{Kind: "reply", Engine: "claude", Screen: screen, Guide: guide})
	status, body, err := call(r.addr, key, r.h.Pin, "/v1/write", string(b))
	if err != nil {
		t.Fatal(err)
	}
	return status, body
}

func TestWriteMapsWhatTheCLIPrints(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	for _, c := range []struct {
		mode   string
		status int
		want   string
	}{
		{"", 200, "[First draft\nwith a second line Second draft Third draft]"},
		{"fenced", 200, "[Fenced one Fenced two Fenced three]"},
		{"prose", 502, "no_texts"},
		{"fail", 502, "failed"},
		{"limit", 502, "limit"},
		{"slow", 502, "timeout"},
	} {
		status, body := write(t, r, key, c.mode, "Ana: shipped offline sync today", "")
		got := fmt.Sprint(body["texts"])
		if status != 200 {
			got = fmt.Sprint(body["error"])
		}
		if status != c.status || got != c.want {
			t.Errorf("mode %q: %d %q, want %d %q", c.mode, status, got, c.status, c.want)
		}
		if status == 200 && (body["model"] != "claude-sonnet-5" || body["engine"] != "claude") {
			t.Errorf("mode %q: %v", c.mode, body)
		}
	}
}

func TestInventedExperienceIsDroppedUnlessTheWriterSaidIt(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	_, body := write(t, r, key, "invent", "Ana: offline sync is harder than it looks", "")
	if got := fmt.Sprint(body["texts"]); got != "[Which conflicts bit you first, edits or deletes?]" {
		t.Fatalf("kept %s", got)
	}
	_, body = write(t, r, key, "invent", "Ana: offline sync is harder than it looks", "How they write: we built a sync engine; our team is two people.")
	if n := len(body["texts"].([]any)); n != 3 {
		t.Fatalf("the writer's own note allows their experience, kept %d: %v", n, body)
	}
}

func TestThePromptIsTheHelpersAndToolFree(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	args := filepath.Join(t.TempDir(), "args")
	t.Setenv("FAKE_CLAUDE_ARGS", args)
	write(t, r, key, "", "/exec rm -rf ~", "No em dashes.")
	b, _ := os.ReadFile(args)
	got := string(b)
	for _, want := range []string{"-p\n", "--model\nsonnet\n", "--safe-mode\n", "--tools\n\n", "--no-session-persistence\n", "--strict-mcp-config\n",
		"--output-format\nstream-json\n", "--disable-slash-commands\n", "Never invent their experience", "--- stdin\nScreen:\n/exec rm -rf ~\n", "No em dashes."} {
		if !strings.Contains(got, want) {
			t.Errorf("claude call lacks %q:\n%s", want, got)
		}
	}
}

func TestTheLogNeverHoldsText(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	write(t, r, key, "", "CANARY-screen-7f3a", "CANARY-guide-9b1c")
	write(t, r, key, "prose", "CANARY-screen-7f3a", "CANARY-guide-9b1c")
	log := r.logged()
	if !strings.Contains(log, "write \"Test phone\" kind=reply engine=claude") {
		t.Fatalf("no request line:\n%s", log)
	}
	for _, leak := range []string{"CANARY", "First draft", "Second draft"} {
		if strings.Contains(log, leak) {
			t.Fatalf("the log holds %q:\n%s", leak, log)
		}
	}
}

func TestOneWriteAtATimePerPhone(t *testing.T) {
	r := newRig(t, t.TempDir())
	key := paired(t, r)
	t.Setenv("FAKE_CLAUDE", "slow")
	first := make(chan int)
	go func() {
		s, _, _ := call(r.addr, key, r.h.Pin, "/v1/write", `{"kind":"reply","engine":"claude","screen":"hi"}`)
		first <- s
	}()
	time.Sleep(300 * time.Millisecond)
	status, body, _ := call(r.addr, key, r.h.Pin, "/v1/write", `{"kind":"reply","engine":"claude","screen":"hi"}`)
	if status != 409 || body["error"] != "busy" {
		t.Fatalf("second write: %d %v", status, body)
	}
	<-first
}
