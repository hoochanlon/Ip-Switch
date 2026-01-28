# IP Switch

[中文 README](./README_CN.md)

<p align="center">
  <img src="./imgs/tarui/logo.png" alt="App icon" width="100"><br/>
  <img src="./imgs/tarui/red-heart.png" width="50">
  <img src="./imgs/tarui/add.png" height="50"> 
  <img src="./imgs/tarui/tarui.png" height="50"> <br/> <br/>
  Switch network “scenes” effortlessly. Hosts and proxy settings work together, with real-time traffic monitoring and network status notifications—so every connection feels smooth and under control.
</p>

## Features

> [!NOTE]
> **Run as Administrator is required**: modifying network configuration needs elevated privileges on Windows.

- ✅ Network status overview (Wi‑Fi/Ethernet, Static/DHCP, IP details)
- ✅ IP configuration switch (Static IP / DHCP)
- ✅ Scene switching (save/load configuration profiles)
- ✅ Hosts file editor, supports remote updates
- ✅ Proxy configuration management, supports remote PAC updates
- ✅ Tray color customization + dynamic colors for different network states
- ✅ Window UX: maximize/restore sync, double‑click titlebar to toggle, maximized layout widens the Scene Manager panel

Download: https://github.com/hoochanlon/Ip-Switch/releases

## Screenshots

Configuration

<!-- ![](./screenshots/demo.png) -->

![](./screenshots/proxy-config.png)

Result

![](./screenshots/google.png)

## Development

Requirements

- Node.js 18+
- Rust 1.70+
- Windows 10/11 (Administrator privileges required)

Install dependencies & run

```bash
npm install
npm run tauri dev
```

Build

```bash
npm run tauri build
```

## NSIS packaging

nullsoft scriptable install system

**Downloads:**

- `https://www.mefcl.com/nsis-3-0-5.html`
- `https://www.cnblogs.com/NSIS/p/16581122.html`

**Basic usage:**

- Compile NSI script via GUI: **Compile NSI script → File → Load Script → `ip-switch.nsi`**
- Or use one‑shot command:

```bash
"C:\Program Files (x86)\NSIS\makensis.exe" ip-switch.nsi
```

Optionally, add NSIS to your `PATH` (pick one of the following), then run from the project root:

```powershell
[Environment]::SetEnvironmentVariable(
  'Path',
  $env:Path + ';C:\Program Files (x86)\NSIS',
  'User'
)
```

```cmd
setx PATH "%PATH%;C:\Program Files (x86)\NSIS"
```

Then, in the project directory:

```bash
makensis ip-switch.nsi
```

## Proxy

> [!NOTE]
> Ad-blocking rules ≠ Clash subscription proxy rules. The former focuses on “fine-grained ad removal”, while the latter is “global traffic routing + (optionally) blocking ad domains”. You can still import dedicated ad rule sets into Clash to improve ad-blocking.

PAC vs Ad-blocking rules

| Item     | Purpose                    | Common tools           | What it blocks/routes  | Example path                                                  | Metaphor       |
|----------|----------------------------|------------------------|------------------------|---------------------------------------------------------------|----------------|
| PAC      | Auto routing / direct/proxy | Omega, Clash           | Domain/IP routing      | Local: 127.0.0.1:21883/pac<br>Remote: pac.provider.com         | Traffic police |
| Ad rules | Block ads / trackers        | uBlock Origin, AdGuard | Domain + path + hide   | Subscription link or in-extension rules                       | Cleaner        |

PAC / ad-block rule list projects

- [gfwlist/gfwlist](https://github.com/gfwlist/gfwlist)
- [PaPerseller/chn-iplist](https://github.com/PaPerseller/chn-iplist)
- [TG-Twilight/AWAvenue-Ads-Rule](https://github.com/TG-Twilight/AWAvenue-Ads-Rule)

**PAC (Proxy Auto-Config) rule markers**

Rules **without** `@@` → **PROXY** (or **REJECT**, depending on the ruleset).

Rules **with** `@@` → **DIRECT** (usually for domestic services).

Example:

```text
! comment line / title

||google.com          # proxy
.duckduckgo.com       # suffix match, proxy
@@||baidu.com         # force direct
```

**Ad-blocking rule markers (uBlock Origin / AdBlock Plus style)**

Rules **without** `@@` → **BLOCK** (ads/trackers/popups, etc.).

Rules **with** `@@` → **EXCEPTION / allowlist** (avoid false positives).

Example:

```text
! comment line / title

||ads.google.com            # block this ad domain and subdomains
.doubleclick.net            # suffix match
@@||baidu.com               # exception: allow Baidu
@@||*.aliyun.com^           # exception: allow all Aliyun domains

example.com##.ad-banner     # hide elements with class="ad-banner"
example.com#@#.good-content # exception: do not hide class="good-content"
```

Mirrors can mitigate GitHub raw fetching issues, but may violate [GitHub ToS](https://github.com/site/terms).

## Recommended Hosts & DNS Lists

**Hosts**

[jplopsoft - HOSTS Blocker common list description](https://jplop.neocities.org/teac_hosts_block)

- [ineo6/hosts](https://github.com/ineo6/hosts)
- [StevenBlack/hosts](https://github.com/StevenBlack/hosts)
- [hagezi/dns-blocklists](https://github.com/hagezi/dns-blocklists)
- [ignaciocastro/a-dove-is-dumb](https://github.com/ignaciocastro/a-dove-is-dumb)

**DNS**

[National Taiwan University CCNS – DNS server list](https://isms.ntu.edu.tw/DNSlist.html)

- [DNS SB](https://dns.sb)
- [Next DNS](https://my.nextdns.io/a9bdef/setup)
- [Quad9](https://quad9.net/)
- [dolingou - Dns Servers Guide](https://www.dolingou.com/article/dns-servers-guide)

Recommended lightweight editors: [Kate](https://kate-editor.org/zh-cn/) + [Notepad4](https://github.com/zufuliu/notepad4)

