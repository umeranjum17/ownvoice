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

  ownvoice-link                 serve paired phones until Ctrl-C
  ownvoice-link pair            show a code for your phone to scan, confirm, then exit
  ownvoice-link phones          list paired phones
  ownvoice-link unpair <name>   forget a phone (by name or key code)

Flags for serving and pairing:
  --listen host:port            listen only here (default: this computer's home-network
                                and tailnet addresses, port 7441)
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
	fs.Parse(args)

	base, err := os.UserConfigDir()
	check(err)
	h, err := Open(filepath.Join(base, "ownvoice-link"))
	check(err)

	switch cmd {
	case "serve", "pair":
		addrs := []string{*listen}
		if *listen == "" {
			addrs = homeAddrs("7441")
		}
		serve(h, addrs, cmd == "pair")
	case "phones":
		phones := h.Phones()
		if len(phones) == 0 {
			fmt.Println("No phones are paired. Run: ownvoice-link pair")
		}
		for p, ph := range phones {
			fmt.Printf("%s  key %s  paired %s  last seen %s\n", ph.Name, Fingerprint(p), ph.Paired.Format("2006-01-02"), ph.Seen.Format("2006-01-02 15:04"))
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

func virtual(name string) bool {
	for _, p := range []string{"docker", "br-", "veth", "virbr", "lxc", "lxd", "podman", "cni", "flannel", "vmnet", "vboxnet"} {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

func serve(h *Helper, addrs []string, pairing bool) {
	if _, err := exec.LookPath("claude"); err == nil {
		h.engines["claude"] = Claude(45 * time.Second)
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
		fmt.Printf("Ownvoice link is on at %s. %d phone(s) paired. Ctrl-C to stop.\n", strings.Join(bound, ", "), len(h.Phones()))
		<-stop
		srv.Close()
		return
	}
	code, err := h.OpenPairing()
	check(err)
	payload, _ := json.Marshal(map[string]any{"v": 1, "pin": h.Pin, "code": code, "addrs": bound})
	in := bufio.NewReader(os.Stdin)
	h.confirm = func(name, fp string) bool {
		fmt.Printf("\nPair %q (key %s)? Only pair your own phone. [y/N] ", name, fp)
		line, _ := in.ReadString('\n')
		line = strings.ToLower(strings.TrimSpace(line))
		return line == "y" || line == "yes"
	}
	fmt.Println("In Ownvoice on your phone, tap \"Pair with my computer\" and scan this code. It works once, for 5 minutes.")
	qrterminal.GenerateHalfBlock(string(payload), qrterminal.L, os.Stdout)
	fmt.Println(string(payload))
	fmt.Printf("Listening on %s.\n", strings.Join(bound, ", "))
	ok := false
	select {
	case name := <-h.Paired:
		if ok = name != ""; ok {
			fmt.Printf("Paired %q. Now run ownvoice-link whenever you want this computer to write.\n", name)
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
