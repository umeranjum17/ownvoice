package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	maxBody   = 16 << 10
	maxScreen = 12000
	maxGuide  = 1000
	maxPhones = 3
	maxTries  = 5
	pairFor   = 5 * time.Minute
)

// Phone is one paired phone, stored by the SHA-256 pin of its public key.
type Phone struct {
	Name   string    `json:"name"`
	Paired time.Time `json:"paired"`
	Seen   time.Time `json:"seen"`
}

// Engine writes drafts: it gets the helper's own system prompt and the phone's text, and returns texts and the model id.
type Engine func(ctx context.Context, system, input string) (texts []string, model string, err error)

// Helper is the whole computer side: its key, the paired phones, the pairing window and the engines.
type Helper struct {
	dir     string
	cert    tls.Certificate
	Pin     string
	engines map[string]Engine
	logf    func(format string, args ...any)
	// confirm asks the person at the computer whether to pair a phone; tests replace it.
	confirm func(name, fingerprint string) bool
	// Paired gets the phone's name once a pairing is saved, or "" when it was refused or the window closed.
	Paired chan string

	mu       sync.Mutex
	phones   map[string]*Phone
	code     string
	codeTill time.Time
	tries    int
	busy     map[string]bool
}

// Open loads or makes the helper's key in dir (0700, files 0600) and loads the paired phones.
func Open(dir string) (*Helper, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return nil, err
	}
	cert, err := loadOrMakeCert(dir)
	if err != nil {
		return nil, err
	}
	h := &Helper{
		dir: dir, cert: cert, Pin: pin(cert.Certificate[0]),
		engines: map[string]Engine{}, logf: log.Printf,
		phones: map[string]*Phone{}, busy: map[string]bool{}, Paired: make(chan string, 1),
	}
	b, err := os.ReadFile(filepath.Join(dir, "phones.json"))
	if err == nil {
		err = json.Unmarshal(b, &h.phones)
	} else if errors.Is(err, os.ErrNotExist) {
		err = nil
	}
	return h, err
}

func loadOrMakeCert(dir string) (tls.Certificate, error) {
	certFile, keyFile := filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
	if c, err := tls.LoadX509KeyPair(certFile, keyFile); err == nil {
		return c, nil
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}
	serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
	tmpl := &x509.Certificate{
		SerialNumber: serial, Subject: pkix.Name{CommonName: "ownvoice"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().AddDate(20, 0, 0),
		KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, err
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return tls.Certificate{}, err
	}
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER}), 0o600); err != nil {
		return tls.Certificate{}, err
	}
	if err := os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600); err != nil {
		return tls.Certificate{}, err
	}
	return tls.LoadX509KeyPair(certFile, keyFile)
}

// pin is the SHA-256 of a certificate's public key (SubjectPublicKeyInfo), base64: what curl's --pinnedpubkey uses.
func pin(der []byte) string {
	c, err := x509.ParseCertificate(der)
	if err != nil {
		return ""
	}
	h := sha256.Sum256(c.RawSubjectPublicKeyInfo)
	return base64.StdEncoding.EncodeToString(h[:])
}

// Fingerprint is two plain words taken from a pin, which the phone shows too, so the person can check
// they are pairing the phone in their hand. The word list is the same as the app's Link.WORDS.
func Fingerprint(p string) string {
	b, _ := base64.StdEncoding.DecodeString(p)
	if len(b) < 2 {
		return "?"
	}
	return words[b[0]] + " " + words[b[1]]
}

var words = [256]string{
	"apple", "arrow", "autumn", "bamboo", "banana", "basket", "beach", "berry", "bicycle", "blanket", "bloom",
	"boat", "bottle", "branch", "bread", "breeze", "brick", "bridge", "brook", "brush", "bubble", "bucket",
	"butter", "button", "cabin", "cactus", "camel", "candle", "canoe", "canyon", "carpet", "carrot", "castle",
	"cedar", "chalk", "cherry", "chess", "cliff", "clock", "cloud", "clover", "coast", "cocoa", "comet",
	"copper", "coral", "cotton", "cradle", "crane", "crayon", "creek", "cricket", "crown", "crystal", "cup",
	"daisy", "dawn", "desert", "diamond", "dolphin", "donkey", "dragon", "drum", "eagle", "earth", "echo",
	"elbow", "ember", "engine", "falcon", "feather", "fern", "ferry", "field", "fig", "flag", "flame", "flute",
	"forest", "fossil", "fountain", "fox", "frost", "garden", "garlic", "giant", "ginger", "glacier", "glove",
	"goat", "gold", "grape", "grass", "guitar", "hammer", "harbor", "harp", "hazel", "helmet", "hill", "honey",
	"horizon", "horse", "island", "ivory", "jacket", "jasmine", "jelly", "jungle", "kettle", "kite", "koala",
	"ladder", "lagoon", "lake", "lamp", "lantern", "lemon", "lily", "lion", "lizard", "lotus", "magnet", "mango",
	"maple", "marble", "meadow", "melon", "meteor", "mint", "mirror", "mitten", "moon", "moss", "mountain",
	"mushroom", "needle", "nest", "night", "noodle", "oak", "ocean", "olive", "onion", "orange", "orbit",
	"otter", "owl", "paddle", "palm", "panda", "paper", "parrot", "peach", "peanut", "pearl", "pebble", "pencil",
	"pepper", "piano", "pillow", "pine", "planet", "plum", "pocket", "pond", "poppy", "potato", "puzzle",
	"quartz", "quilt", "rabbit", "radio", "rain", "raven", "reef", "ribbon", "river", "robin", "rocket", "rose",
	"saddle", "sail", "salmon", "sand", "saturn", "shell", "silver", "sky", "sled", "snow", "sock", "spark",
	"spider", "spoon", "spring", "squash", "star", "stone", "storm", "straw", "sugar", "summer", "sun", "swan",
	"table", "tiger", "toast", "tomato", "torch", "tower", "train", "tulip", "tunnel", "turtle", "umbrella",
	"valley", "velvet", "violet", "volcano", "wagon", "walnut", "water", "whale", "wheat", "whistle", "willow",
	"window", "winter", "wolf", "wool", "yarn", "zebra", "acorn", "anchor", "badger", "beacon", "birch", "bison",
	"cobalt", "compass", "dune", "elm", "fiddle", "galaxy", "geyser", "gravel", "heron", "iris", "juniper",
	"kayak", "lava", "lemur", "linen", "lynx", "yogurt",
}

// OpenPairing starts a pairing window and returns its one-time code.
func (h *Helper) OpenPairing() (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if len(h.phones) >= maxPhones {
		return "", fmt.Errorf("%d phones are paired already; unpair one first", len(h.phones))
	}
	b := make([]byte, 16)
	rand.Read(b)
	h.code, h.codeTill, h.tries = base64.RawURLEncoding.EncodeToString(b), time.Now().Add(pairFor), 0
	return h.code, nil
}

func (h *Helper) pairingOpen() bool {
	return h.code != "" && time.Now().Before(h.codeTill)
}

// TLSConfig is TLS 1.3 with a client key required. Outside a pairing window only paired keys get past the handshake.
func (h *Helper) TLSConfig() *tls.Config {
	return &tls.Config{
		Certificates: []tls.Certificate{h.cert},
		MinVersion:   tls.VersionTLS13,
		ClientAuth:   tls.RequireAnyClientCert,
		VerifyPeerCertificate: func(raw [][]byte, _ [][]*x509.Certificate) error {
			if len(raw) == 0 {
				return errors.New("no client key")
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			if h.phones[pin(raw[0])] != nil || h.pairingOpen() {
				return nil
			}
			return errors.New("not paired")
		},
	}
}

// Handler serves pair, hello and write, and nothing else.
func (h *Helper) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/pair", h.pair)
	mux.HandleFunc("POST /v1/hello", h.paired(h.hello))
	mux.HandleFunc("POST /v1/write", h.paired(h.write))
	return http.MaxBytesHandler(mux, maxBody)
}

func peerPin(r *http.Request) string {
	if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
		return ""
	}
	return pin(r.TLS.PeerCertificates[0].Raw)
}

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

type failure struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

func fail(w http.ResponseWriter, status int, code, message string) {
	reply(w, status, failure{code, message})
}

// decode reads exactly one JSON object and refuses unknown fields.
func decode(r *http.Request, v any) error {
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		return err
	}
	if d.More() {
		return errors.New("one object only")
	}
	return nil
}

func (h *Helper) paired(next func(http.ResponseWriter, *http.Request, string, *Phone)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := peerPin(r)
		h.mu.Lock()
		phone := h.phones[p]
		h.mu.Unlock()
		if phone == nil {
			fail(w, http.StatusForbidden, "not_paired", "not paired")
			return
		}
		next(w, r, p, phone)
	}
}

type about struct {
	Computer string   `json:"computer"`
	Engines  []string `json:"engines"`
}

func (h *Helper) about() about {
	name, _ := os.Hostname()
	a := about{Computer: name, Engines: []string{}}
	for e := range h.engines {
		a.Engines = append(a.Engines, e)
	}
	return a
}

func (h *Helper) pair(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	if err := decode(r, &req); err != nil || strings.TrimSpace(req.Name) == "" || len(req.Name) > 60 {
		fail(w, http.StatusBadRequest, "bad_request", "only a code and a name")
		return
	}
	p := peerPin(r)
	h.mu.Lock()
	open := h.pairingOpen()
	right := open && subtle.ConstantTimeCompare([]byte(req.Code), []byte(h.code)) == 1
	if right {
		h.code = "" // burnt before anything else, whatever happens next
	} else if open {
		if h.tries++; h.tries >= maxTries {
			h.code = ""
		}
	}
	closedNow := open && h.code == ""
	h.mu.Unlock()
	if !right {
		h.logf("pair refused: wrong or expired code")
		if closedNow {
			h.done("")
		}
		fail(w, http.StatusForbidden, "bad_code", "wrong or expired code")
		return
	}
	// A phone that gave up waiting for the answer isn't paired.
	if p == "" || !h.confirm(req.Name, Fingerprint(p)) || r.Context().Err() != nil {
		h.logf("pair refused at the computer")
		h.done("")
		fail(w, http.StatusForbidden, "refused", "refused at the computer")
		return
	}
	h.mu.Lock()
	now := time.Now()
	h.phones[p] = &Phone{Name: req.Name, Paired: now, Seen: now}
	err := h.save()
	h.mu.Unlock()
	if err != nil {
		fail(w, http.StatusInternalServerError, "failed", "couldn't save the pairing")
		return
	}
	h.logf("paired %q (%s)", req.Name, Fingerprint(p))
	reply(w, http.StatusOK, h.about())
	h.done(req.Name)
}

func (h *Helper) done(name string) {
	select {
	case h.Paired <- name:
	default:
	}
}

func (h *Helper) hello(w http.ResponseWriter, r *http.Request, p string, phone *Phone) {
	var req struct{}
	if err := decode(r, &req); err != nil {
		fail(w, http.StatusBadRequest, "bad_request", "hello takes nothing")
		return
	}
	h.seen(p)
	h.logf("hello from %q", phone.Name)
	reply(w, http.StatusOK, h.about())
}

// WriteRequest is everything a phone may send: data, never instructions. The prompt, model and flags are the helper's.
type WriteRequest struct {
	Kind   string `json:"kind"`
	Engine string `json:"engine"`
	Screen string `json:"screen"`
	Guide  string `json:"guide"`
}

type written struct {
	Texts  []string `json:"texts"`
	Engine string   `json:"engine"`
	Model  string   `json:"model"`
	Ms     int64    `json:"ms"`
}

func (h *Helper) write(w http.ResponseWriter, r *http.Request, p string, phone *Phone) {
	var req WriteRequest
	if err := decode(r, &req); err != nil || req.Kind != "reply" || len([]rune(req.Screen)) > maxScreen || len([]rune(req.Guide)) > maxGuide || strings.TrimSpace(req.Screen) == "" {
		fail(w, http.StatusBadRequest, "bad_request", "only text in, drafts out")
		return
	}
	engine := h.engines[req.Engine]
	if engine == nil {
		fail(w, http.StatusBadRequest, "no_engine", "that engine isn't available on this computer")
		return
	}
	h.mu.Lock()
	if h.busy[p] {
		h.mu.Unlock()
		fail(w, http.StatusConflict, "busy", "still writing the last one")
		return
	}
	h.busy[p] = true
	h.mu.Unlock()
	defer func() { h.mu.Lock(); delete(h.busy, p); h.mu.Unlock() }()

	started := time.Now()
	texts, model, err := engine(r.Context(), replySystem, replyInput(req.Screen, req.Guide))
	if err == nil {
		texts = keepOwnExperience(texts, req.Guide)
		if len(texts) == 0 {
			err = errNoTexts
		}
	}
	ms := time.Since(started).Milliseconds()
	h.seen(p)
	// One line per request and never any text: who, what, which engine, how many, how long, how much.
	h.logf("write %q kind=%s engine=%s model=%s texts=%d ms=%d screen=%d guide=%d err=%v",
		phone.Name, req.Kind, req.Engine, model, len(texts), ms, len(req.Screen), len(req.Guide), errCode(err))
	if err != nil {
		var ee *EngineError
		if errors.As(err, &ee) {
			fail(w, http.StatusBadGateway, ee.Code, ee.Message)
		} else {
			fail(w, http.StatusBadGateway, "failed", "the writer failed")
		}
		return
	}
	reply(w, http.StatusOK, written{texts, req.Engine, model, ms})
}

func (h *Helper) seen(p string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if ph := h.phones[p]; ph != nil {
		ph.Seen = time.Now()
		h.save()
	}
}

// save writes phones.json; call with h.mu held.
func (h *Helper) save() error {
	b, err := json.MarshalIndent(h.phones, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(h.dir, "phones.json.tmp")
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(h.dir, "phones.json"))
}

// Phones lists the paired phones by pin.
func (h *Helper) Phones() map[string]Phone {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string]Phone{}
	for p, ph := range h.phones {
		out[p] = *ph
	}
	return out
}

// Unpair forgets every phone with this name, or with this fingerprint; it reports how many it removed.
func (h *Helper) Unpair(name string) (int, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for p, ph := range h.phones {
		if ph.Name == name || Fingerprint(p) == name {
			delete(h.phones, p)
			n++
		}
	}
	if n == 0 {
		return 0, nil
	}
	return n, h.save()
}
