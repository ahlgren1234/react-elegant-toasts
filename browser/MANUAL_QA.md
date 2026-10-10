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

### The 10-minute progress preset (MC-5, MC-1)

**10-minute progress — background/visibility test** (first under **Presets**) adds an info toast
that runs for 600 000 ms with its progress bar. That is long enough to switch windows or apps, hide
the tab, minimise, or stay hidden for more than five minutes, and still return to the same toast.

1. **Clear log**, then add the toast. Move the pointer and focus away from it, unless the case
   needs focus inside it (Alt+T, then Tab, for the focus-within case).
2. Note its `phase`, `paused` and `progress` in **Status**.
3. Leave and return as the case requires.
4. Read the same values again, then **Download JSON**. The log holds the window focus and blur,
   `visibilitychange`, focus and `data-paused` entries in order.

The page gives no verdict: compare what you see with the checkpoint's expected result.

### The custom close ring (MC-8, CF-12)

Custom toasts have no close button unless **Close button on custom toasts** (under **Next toast**)
is ticked. It applies to custom toasts only, including the **Custom 280 × 96** preset.

1. Tick **Close button on custom toasts**, then add **Custom 280 × 96**.
2. Using only the keyboard, Tab from **Before the region** to the custom toast's close button.
3. Expected: the close button shows a ring in the content's text colour (`currentColor`), clearly
   visible and not clipped. Check it in the light and dark themes. Record what you see.

### An insertion during a swipe fly-out (MC-8, CF-35; needs touch)

**Add one in 2 s** adds one toast, with the **Next toast** settings, about 2 seconds after the
click. The log records `add-scheduled` at the click; when it fires, the new toast's `create` entry
and then `add-scheduled-fired` with its ID. The button stays disabled until the toast is added, so
only one insertion is ever pending, and settings changed meanwhile do not affect it.

1. Tick **Slow motion**. The fly-out then takes 1.2 s. **Slow motion does not slow the 200 ms
   stack reposition**: that is fixed in the stylesheet and is not a token.
2. Add a **Persistent swipe target** at a top position.
3. Tap **Add one in 2 s**, then swipe the toast past the threshold about 1.5 seconds later, so
   that the new toast arrives, and the stack repositions, while the swiped toast is flying out.
4. Expected: the swiped toast keeps travelling sideways while the stack moves, with no visible jump
   or stutter. The automated evidence (P-22 S5.3) found at most one held frame in some engines; it
   is accepted as cosmetic.
5. Record what you saw by eye, and whether the insertion landed during the fly-out. The log shows
   the order: the swiped toast's `toast-attribute` entry for `data-phase` `exiting`, then
   `add-scheduled-fired`, then its `dismiss` with reason `swipe` when it is removed. A visual check
   cannot confirm or rule out a single held frame; do not record one as measured.

A mouse drag never swipes, so this needs a touch device.

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
