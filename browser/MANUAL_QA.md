# Manual QA page (P-22 S6)

`/manual.html` is the page for P-22's manual checkpoints (MC-1 to MC-8, `docs/V2_PLAN.md`): the real
library from `src/` and the production stylesheet, with on-page controls, a live status and an
exportable event log. It is separate from the automated harness (`/`), which it does not change.
Nothing on it is sent anywhere: the log stays in the page until you download it.

## Serve it on this machine

From the repository, in WSL:

```sh
npm run browser:serve
```

This builds the harness and serves it on `127.0.0.1:4180`. Open
**`http://localhost:4180/manual.html`** in a Windows desktop browser: WSL forwards `localhost` to
Windows. Stop the server with Ctrl+C.

## Use it

1. Type the device, operating system and browser (with versions) in **Session label**.
2. Set the Toaster (position, direction, theme, `maxVisible`, slow motion) and add toasts with the
   **Next toast** controls or a **Preset**.
3. Run the checkpoint's cases. The **Status** box updates four times a second; the **Event log**
   shows the newest 150 of up to 2000 entries.
4. **Download JSON** saves the log, the environment and the current status as a file (on iOS, to
   Files). **Show JSON** shows the same text to select by hand if a download is blocked.
5. **Clear log** before the next case, so each export holds one case.

Toasts sit above the page, so at a top or bottom position they can cover controls at that edge:
scroll the controls toward the middle of the screen.

## Phones on the same network (not set up; needs the maintainer's approval)

WSL2 here uses NAT networking, so a phone cannot reach the server inside WSL directly. The
temporary approach below forwards one port from Windows to WSL for the length of a session, then
removes everything. **Nothing here has been run.** Each step changes Windows configuration and
needs an explicit go-ahead.

**Prerequisites:**

- an administrator PowerShell on Windows;
- the IP Helper service (`iphlpsvc`) running, which `portproxy` needs;
- the phone on the same Wi-Fi as the PC, with no guest network or client isolation, and no VPN on
  either device;
- the PC's network set to the **Private** profile (`Get-NetConnectionProfile`).

**Addresses change.** Look them up at the start of every session, and again after a reboot or a
WSL restart:

- the WSL address: in WSL, `hostname -I` (the first address);
- the Windows LAN address: in PowerShell,
  `Get-NetIPAddress -AddressFamily IPv4 | Where-Object PrefixOrigin -eq Dhcp`, or `ipconfig`.

**Steps:**

1. In WSL, serve on all of WSL's interfaces:

   ```sh
   npm run browser:serve -- --host
   ```

2. In the administrator PowerShell, with the two addresses from above:

   ```powershell
   netsh interface portproxy add v4tov4 listenaddress=<WINDOWS_LAN_IP> listenport=4180 connectaddress=<WSL_IP> connectport=4180
   New-NetFirewallRule -DisplayName "P22 manual QA 4180 (temporary)" -Direction Inbound -Protocol TCP -LocalPort 4180 -Action Allow -Profile Private -RemoteAddress LocalSubnet
   netsh interface portproxy show v4tov4
   ```

   The forward listens on the LAN address only, and the rule admits only the local subnet on a
   private network.

3. On the phone, open `http://<WINDOWS_LAN_IP>:4180/manual.html`.

**Cleanup, at the end of every session:**

```powershell
netsh interface portproxy delete v4tov4 listenaddress=<WINDOWS_LAN_IP> listenport=4180
Remove-NetFirewallRule -DisplayName "P22 manual QA 4180 (temporary)"
netsh interface portproxy show v4tov4
Get-NetFirewallRule -DisplayName "P22 manual QA 4180 (temporary)" -ErrorAction SilentlyContinue
```

The last two commands should show no forward and no rule. Then stop the server in WSL with Ctrl+C.
If the WSL address changes during a session, delete the forward and add it again with the new
address.

While the forward is open, anyone on the local network can load the page over plain HTTP. It holds
no secrets, but keep the forward open only while testing.

Not used: WSL mirrored networking (it changes `.wslconfig` for all of WSL) and public tunnels (they
expose the page beyond the local network).
