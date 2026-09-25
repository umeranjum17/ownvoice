// Command ownvoice-link lets the Ownvoice app on your own phone ask this computer for reply drafts.
// It runs your own signed-in claude CLI with no tools, and answers only paired phones, over pinned mutual TLS.
// It runs in the foreground until you stop it with Ctrl-C; it is never a service.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mdp/qrterminal/v3"
)

const usage = `ownvoice-link: your computer writes Ownvoice drafts for your own phone.

  ownvoice-link pair            show a code for your phone to scan, then exit
  ownvoice-link                 write drafts for your paired phone until Ctrl-C
  ownvoice-link phones          list paired phones
  ownvoice-link unpair <name>   forget a phone (by name or its two words)

Flags for serving and pairing:
  --listen host:port            listen only here (default: this computer's home-network
                                and tailnet addresses, port 7441)
  --show-text                   pair: also print the code as text, for tests
`

func main() {
	args := os.Args[1:]
	cmd := "serve"
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		cmd, args = args[0], args[1:]
	}
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage) }
	listen := fs.String("listen", "", "")
	showText := fs.Bool("show-text", false, "")
	fs.Parse(args)

	base, err := os.UserConfigDir()
	check(err)
	h, err := Open(filepath.Join(base, "ownvoice-link"))
	check(err)

	switch cmd {
	case "serve", "pair":
		addrs := homeAddrs("7441")
		if *listen != "" {
			check(privateListen(*listen))
			addrs = []string{*listen}
		}
		serve(h, addrs, cmd == "pair", *showText)
	case "phones":
		phones := h.Phones()
		if len(phones) == 0 {
			fmt.Println("No phones are paired. Run: ownvoice-link pair")
		}
		for p, ph := range phones {
			fmt.Printf("%s  (%s)  paired %s  last seen %s\n", ph.Name, Fingerprint(p), ph.Paired.Format("2006-01-02"), ph.Seen.Format("2006-01-02 15:04"))
		}
	case "unpair":
		if fs.NArg() != 1 {
			fs.Usage()
			os.Exit(2)
		}
		n, err := h.Unpair(fs.Arg(0))
		check(err)
		fmt.Printf("Forgot %d phone(s).\n", n)
	default:
		fs.Usage()
		os.Exit(2)
	}
}

func check(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "ownvoice-link:", err)
		os.Exit(1)
	}
}

// homeAddrs are this computer's private (home network) and tailnet (100.64/10) IPv4 addresses,
// never a public one and never a container bridge.
func homeAddrs(port string) []string {
	_, tailnet, _ := net.ParseCIDR("100.64.0.0/10")
	var out []string
	ifs, _ := net.Interfaces()
	for _, i := range ifs {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 || virtual(i.Name) {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			n, ok := a.(*net.IPNet)
			if ok && n.IP.To4() != nil && (n.IP.IsPrivate() || tailnet.Contains(n.IP)) {
				out = append(out, net.JoinHostPort(n.IP.String(), port))
			}
		}
	}
	sort.Strings(out)
	return out
}

func privateListen(addr string) error {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	_, tailnet, _ := net.ParseCIDR("100.64.0.0/10")
	if ip == nil || !(ip.IsPrivate() || ip.IsLoopback() || tailnet.Contains(ip)) || port == "" {
		return fmt.Errorf("--listen needs a private, tailnet or loopback IP and port")
	}
	return nil
}

func virtual(name string) bool {
	for _, p := range []string{"docker", "br-", "veth", "virbr", "lxc", "lxd", "podman", "cni", "flannel", "vmnet", "vboxnet"} {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

func serve(h *Helper, addrs []string, pairing, showText bool) {
	if _, err := exec.LookPath("claude"); err == nil {
		h.engine = Claude(45 * time.Second)
	} else {
		fmt.Println("claude isn't installed here, so this computer can't write drafts yet. Install Claude Code and sign in first.")
	}
	srv := &http.Server{
		Handler: h.Handler(), TLSConfig: h.TLSConfig(),
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 3 * time.Minute, IdleTimeout: 10 * time.Second,
	}
	var bound []string
	for _, a := range addrs {
		l, err := net.Listen("tcp", a)
		if err != nil {
			fmt.Printf("Can't listen on %s: %v\n", a, err)
			continue
		}
		bound = append(bound, a)
		go srv.ServeTLS(l, "", "")
	}
	if len(bound) == 0 {
		check(fmt.Errorf("no address to listen on; try --listen"))
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	if !pairing {
		if len(h.Phones()) == 0 {
			fmt.Println("No phone is paired yet. Stop this with Ctrl-C and run: ownvoice-link pair")
		} else {
			fmt.Println("Ownvoice link is on: your phone's drafts are written here until you press Ctrl-C.")
		}
		<-stop
		srv.Close()
		return
	}
	code, err := h.OpenPairing()
	check(err)
	payload, _ := json.Marshal(map[string]any{"v": 1, "pin": h.Pin, "code": code, "addrs": bound})
	in := bufio.NewReader(os.Stdin)
	h.confirm = func(name, fp string) bool {
		fmt.Printf("\n%q wants to pair. Your phone shows two words: are they \"%s\"?\nOnly pair your own phone. Pair it? [y/N] ", name, fp)
		line, _ := in.ReadString('\n')
		line = strings.ToLower(strings.TrimSpace(line))
		return line == "y" || line == "yes"
	}
	fmt.Println("In Ownvoice on your phone, tap \"Use my computer\" and scan this code. It works once, for 5 minutes.")
	qrterminal.GenerateHalfBlock(string(payload), qrterminal.L, os.Stdout)
	if showText {
		fmt.Println(string(payload))
	}
	ok := false
	select {
	case name := <-h.Paired:
		if ok = name != ""; ok {
			fmt.Printf("Paired %q. From now on, run ownvoice-link whenever you want this computer to write your drafts.\n", name)
		} else {
			fmt.Println("Not paired. Run ownvoice-link pair to try again.")
		}
	case <-time.After(pairFor):
		fmt.Println("The code expired. Run ownvoice-link pair to try again.")
	case <-stop:
	}
	// Let the phone get its answer before exiting.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
	if !ok {
		os.Exit(1)
	}
}
