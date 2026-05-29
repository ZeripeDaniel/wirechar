## Star History

<a href="https://www.star-history.com/?repos=ZeripeDaniel%2Fwirechar&type=timeline&logscale=&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ZeripeDaniel/wirechar&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ZeripeDaniel/wirechar&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ZeripeDaniel/wirechar&type=timeline&legend=top-left" />
 </picture>
</a>

## wirechar

A network traffic visualizer with a pixel-art character at its heart.

Inspired by Wireshark but rebuilt around a different question: what would it
look like if the packets flying through your NIC had a *personality*? A small
pixel character stands on a dark grid. Every packet is a particle — incoming
traffic flies toward it, outgoing traffic flies away. When the host is one of
50+ well-known services (Discord, Naver, Google, YouTube, Anthropic, …) the
particle renders as that brand's official logo. When the character gets
flooded by an attacker, it switches to a defensive stance with shield and
spear, and you can auto-block the source IP via Windows Firewall + WinDivert
in real time.

It is not meant to replace Wireshark for forensics. It is meant to make 24/7
network awareness feel less like staring at a terminal.

![wirechar character icon](build/icons/icon-256.png)

## Features

### Capture & visualization
- Live packet capture via **Wireshark/tshark** and **Npcap** (Windows)
- Pixel-art character that animates with traffic direction
- Lane-based particles — same remote host always flies along the same path,
  inbound/outbound rendered as two parallel lines
- 53+ real brand logos drawn directly from `simple-icons` (Discord, Naver,
  Google, YouTube, Cloudflare, AWS, Anthropic, …) using `Path2D` on canvas
- Wireshark-style packet inspector at the bottom (packet list + layered
  detail tree + raw hex dump)
- Wireshark display-filter syntax passed straight to `tshark -Y`
- Wildcard / CIDR search across the in-memory packet buffer
  (e.g. `192.168.0.*`, `10.0.0.0/24`, `port:443`, `tag:web-search`)

### Defense / attack detection
- Sliding-window detector for flood, SYN flood, port scan, ICMP flood
  and global DDoS
- **Trusted-host whitelist** — Anthropic / OpenAI / Google / Cloudflare /
  AWS / Naver / Kakao etc. are never flagged
- Three defense modes: **Off**, **Detect**, **Auto-Block**
- Real-time blocking via **WinDivert** (≈ sub-millisecond drop at the WFP
  callout layer) combined with `netsh advfirewall` for persistence
- Character reacts: holds shield + spear in defense mode, flashes "hurt"
  when a demonic attack particle lands, switches to a sustained block
  stance when a flood is confirmed
- Manual block / unblock from the Attack Log tab or the right-click menu

### Logging
- Append-only JSONL session log under `<install-dir>/logs/`
- Logging policies (selectable from the tray menu):
  - **Off** — never write to disk
  - **Attacks only** (default) — only packets to/from a flagged attacker,
    plus a forensic dump of the last ≈500 packets matching that IP from a
    rolling context buffer
  - **Smart** — drop multicast / mDNS / SSDP / NetBIOS / DHCP and trusted
    providers, keep the rest
  - **All** — full forensic record
- Manual "Clear logs" button with a native confirmation dialog
- Rolling pcap files (50 MB × 6 = ≈300 MB rotating window) for on-demand
  hex-dump lookups; never stops capturing on its own
- `tshark` auto-restart if its process dies unexpectedly

### IP ↔ host learning
- Every observed SNI / HTTP Host / DNS A / AAAA answer feeds a persistent
  `<userData>/ip-host-cache.json` (LRU, 10k entries)
- Renderer bootstraps the cache on startup, so brand badges survive restarts
- Background reverse-DNS (PTR) resolver fills in IPs that never expose a
  hostname (Discord voice, WebRTC media, game UDP) — results stream into the
  renderer cache live

### UI
- Bottom inspector tabs: **Live Traffic**, **Devices**, **Statistics**,
  **Attack Log**
- Devices tab: passive NAC-style inventory (MAC + IP + vendor via OUI lookup
  + packet count + last seen)
- Statistics tab: top talkers, protocol distribution, classifier breakdown,
  session summary, disk-log path
- **Dark / light theme** toggle, **per-interface local-IP badge**,
  **bundled font picker** (D2Coding / NanumGothic / NanumBarunGothic /
  NanumSquareNeo / NotoSansKR) and **UI font-size selector** — all persisted
- Bilingual UI (English / 한국어) with first-run language picker and live
  switching from the title bar dropdown; native dialogs and the tray menu
  are translated too
- **Capture button and Defense mode are independent**: defense can run in
  "stealth mode" with the live packet list and ambient particles hidden
  while attack detection keeps running silently in the background
- Minimise to system tray (character pixel art is the tray icon); capture
  and defense keep running when the window is hidden
- Tray menu: show/hide, defense mode, logging policy, open logs folder, quit

### Build / distribution
- Two build targets:
  - **Portable .exe** (~66 MB) — single file, runs from anywhere
  - **NSIS installer** (~272 MB) — bundles the official Wireshark installer
    and the WinDivert kernel driver, so a fresh PC can install both in one
    flow (the Wireshark setup is launched only if it isn't already present)
- Custom `Tray` icon, `.ico`, installer art, and dialog logo are all
  generated at build time from the same character pixel data — no external
  image assets required
- Brand-icon data file is regenerated from `simple-icons` at every build

## Requirements

### End user (run the .exe)
- Windows 10 or 11, **x64**
- **Wireshark** (the NSIS installer bundles it; the portable build will
  pop up a dialog with a download link if it's missing)
- **Administrator privileges** — required for raw socket / Npcap capture
  (the .exe is marked `requireAdministrator` so UAC auto-prompts)

### Developer / building from source
- Node.js 18+ and npm
- For the WinDivert helper (`wirechar-divert.exe`):
  Visual Studio Build Tools with the "Desktop development with C++" workload

## Install

Grab a build from the GitHub Releases page:

- `wirechar-<version>-portable.exe` — double-click, no installation
- `wirechar-<version>-setup.exe` — guided installer, registers WinDivert
  driver service, optionally installs Wireshark for you

Either way Windows will prompt for admin via UAC on launch.

## Configure

- **Title bar**: theme toggle (🌙/☀), font family, font size, language.
- **Toolbar**: interface picker, **Capture** button, **Defense mode**
  dropdown (`Off` / `Detect` / `Attack Detection + Auto-Block`),
  Wireshark display filter.
- **Tray menu** (right-click the character icon): show/hide window,
  defense mode, disk logging policy, open logs folder, quit.
- **Inspector tabs**: switch between live, devices, stats, attack log.
- **Filter input** (toolbar): full Wireshark display-filter syntax,
  applied at the tshark level.
- **List search** (above the packet list): in-memory substring + wildcard
  + CIDR + `field:value` queries.

Settings persist to `<userData>/settings.json`:
language, defense mode, logging policy, theme, font family, font size.

## Build from source

```bash
git clone <repo>
cd wirechar
npm install

# Dev (Electron + live capture)
npm start

# Generate just the icons
npm run gen-icon
npm run gen-brands

# Build artifacts
npm run build:portable    # → dist/wirechar-<ver>-portable.exe
npm run build:installer   # → dist/wirechar-<ver>-setup.exe
npm run build:all         # both
```

The installer build needs:

1. **VS Build Tools** in `PATH` — `build/build-helper.bat` auto-locates it
   via `vswhere` and compiles `wirechar-divert.exe`.
2. Internet on first build — `npm run fetch-wireshark` and
   `npm run fetch-windivert` download the SDKs once and cache the result.

The build runs from an elevated PowerShell so it can extract symlinks from
the `winCodeSign` cache. A regular shell works if **Developer Mode** is on.

## Architecture (10-second tour)

```
main process (Electron)            renderer (browser context)
├ src/capture.js                   ├ renderer/app.js           — orchestration
├ src/detector.js  ── ipc ───▶     ├ renderer/character.js     — pixel art FSM
├ src/firewall.js                  ├ renderer/particles.js     — Canvas animation
├ src/firewall-windivert.js        ├ renderer/brand-styles.js  — brand badges (Path2D)
├ src/ip-host-cache.js             ├ renderer/brand-icons-data.js (auto-gen)
├ src/ptr-lookup.js                ├ renderer/classify.js      — packet→user-friendly tag
├ src/trusted.js                   ├ renderer/detail.js        — inspector tree
├ src/search.js                    ├ renderer/search.js        — wildcard / CIDR
├ src/settings.js                  ├ renderer/i18n.js          — en/ko
├ src/dialog-strings.js            ├ renderer/oui.js           — MAC → vendor
└ main.js                          └ renderer/index.html

build/                  resources/  (packaged)
├ windivert-helper/    ┌ icons/, windivert/, wireshark/  (filtered per target)
├ generate-icon.js     │
├ generate-brand-icons.js
├ download-wireshark.js
├ download-windivert.js
├ build-helper.bat     — compiles wirechar-divert.exe
└ installer.nsh        — NSIS hooks: bundled Wireshark setup + driver registration
```

## Known limits

- **Volumetric DDoS can't be stopped at the PC layer.** Once your uplink is
  saturated, software on your machine cannot help — the bandwidth is
  already gone. wirechar can *detect* and *log* the attack; real
  mitigation has to happen upstream (VPN, ISP filter, cloud scrubbing).
  The Auto-Block mode is effective against app-layer floods, SYN floods
  and slow attacks, not against gigabit floods.
- **Brand matching needs host info.** If a session has no observable SNI,
  HTTP Host, DNS answer or PTR record, wirechar can't tell who that IP is.
  This is most visible on Discord voice / WebRTC media until the PTR
  resolver fills in.
- **Same broadcast domain only.** Network Devices discovery (NAC-style)
  only sees what reaches your NIC — not other VLANs / other home networks.
  Needs a switch SPAN port to see beyond your machine.
- **Windows only**, x64. Linux / macOS ports are possible but not built.

## Changelog

### 1.0.10
- **Defense mode UI separated from capture.** The `Defense` selector moved
  from the title bar into the toolbar, right next to the `Capture` button.
  Real-time packet list and ambient particles are now gated on whether the
  user explicitly pressed `Capture` — defense alone runs in stealth, only
  surfacing attack packets. Starting capture while defense is active
  reveals the full feed; stopping it returns to stealth without tearing
  down the underlying tshark process.
- **Per-interface local-IP badge.** The IP shown in the title bar now
  matches the IPv4 of the selected NIC instead of whichever interface
  `os.networkInterfaces()` listed first. Switching the interface dropdown
  updates the badge live.
- **Dark / light theme.** Theme toggle in the title bar; persisted across
  launches. Canvas grid + vignette adapt to the active theme.
- **Bundled font picker + size selector.** Five Korean-friendly fonts
  ship in the renderer (D2Coding, NanumGothic, NanumBarunGothic,
  NanumSquareNeo, NotoSansKR). UI size is rem-based so every label, list
  cell and panel header scales together (9–24 px range). Fonts are
  preloaded at startup so dropdown switches are visually instant.
- **NSIS upgrades preserve state.** The uninstaller's WinDivert-service
  + firewall-rule cleanup now runs only on user-initiated removal. During
  an upgrade install (electron-builder silently runs the old uninstaller)
  blocked-IP rules and the driver service are kept intact.
- **Same install folder on upgrade.** `appId` + `perMachine` means the
  new version writes over `C:\Program Files\wirechar\` in place;
  `%APPDATA%\wirechar\` (settings, IP cache, whitelist, logs) is
  untouched.

### Earlier
See `git log` for 1.0.1 – 1.0.9. Highlights: WinDivert real-time blocking
(1.0.5), userData log path under `%APPDATA%` (1.0.6), user whitelist + brand
info in Attack Log (1.0.7), Discord voice CIDR + 8 s grace + PTR → detector
sync (1.0.8), README + LICENSE shipped (1.0.9).

## License

wirechar source code is released under **GPL-2.0-only** (see [`License/GNU General Public License v2.0.txt`](License/GNU%20General%20Public%20License%20v2.0.txt)).

This license was chosen because the distribution bundles WinDivert, whose
kernel driver (`WinDivert64.sys`) is GPL-2.0. Bundling it under the
open-source path requires the whole distribution to be GPL-2.0-compatible.

**Personal use is free.** Commercial distribution requires you to also
obtain separate commercial licenses for WinDivert and Npcap, and to comply
with all GPL-2.0 obligations (full source disclosure). In practice this
makes commercial exploitation without the author's involvement effectively
non-viable.

Third-party components bundled in distribution builds:

| Component | License | Bundled in |
|-----------|---------|------------|
| Wireshark | GPL-2.0 | NSIS installer only |
| Npcap | Custom (free for personal use) | Installed by Wireshark |
| WinDivert | LGPL-2.1 (DLL) / GPL-2.0 (driver) | NSIS installer |
| simple-icons | CC0 | Embedded at build time |
| Electron | MIT | All builds |

======================================================================

# wirechar

픽셀 아트 캐릭터를 중심에 둔 네트워크 트래픽 시각화 도구.

Wireshark에서 영감을 받았지만 다른 질문에서 출발했습니다 — 만약 내 NIC를
통과하는 패킷들에 *성격*이 있다면 어떤 모습일까? 어두운 격자 위에 작은
픽셀 캐릭터가 서 있고, 모든 패킷은 파티클로 표현됩니다. 수신 트래픽은
캐릭터를 향해 날아오고, 송신 트래픽은 캐릭터에서 밖으로 날아갑니다.
호스트가 잘 알려진 서비스(디스코드, 네이버, 구글, 유튜브, Anthropic 등
50종 이상)면 해당 브랜드의 공식 로고가 그대로 파티클로 표시됩니다.
공격자가 캐릭터에 패킷을 쏟아붓기 시작하면 캐릭터는 방패와 창을 든
방어 자세로 전환되고, Windows Firewall + WinDivert를 통해 공격자 IP를
**실시간으로** 자동 차단할 수 있습니다.

포렌식 도구로 Wireshark를 대체하려는 건 아닙니다. **24/7 네트워크
가시성을 터미널 응시 노동에서 해방시키는 것**이 목표입니다.

![wirechar 캐릭터 아이콘](build/icons/icon-256.png)

## 기능

### 캡처 & 시각화
- **Wireshark/tshark** + **Npcap** 기반 실시간 패킷 캡처 (Windows)
- 트래픽 방향에 따라 움직이는 픽셀 아트 캐릭터
- 호스트별 lane 시스템 — 같은 원격 IP는 항상 같은 경로로,
  수신/송신은 두 줄의 평행선으로 표시
- `simple-icons`에서 추출한 **실제 브랜드 로고 53종 이상** —
  Discord, Naver, Google, YouTube, Cloudflare, AWS, Anthropic 등을
  캔버스 `Path2D`로 직접 그림
- Wireshark 스타일 패킷 인스펙터 (패킷 리스트 + 레이어 디테일 트리 +
  원본 hex dump)
- Wireshark display-filter 문법을 그대로 `tshark -Y`에 전달
- 메모리 패킷 버퍼에 대해 와일드카드 / CIDR 검색 지원
  (예: `192.168.0.*`, `10.0.0.0/24`, `port:443`, `tag:web-search`)

### 방어 / 공격 감지
- 슬라이딩 윈도우 detector — flood, SYN flood, 포트 스캔,
  ICMP flood, 글로벌 DDoS 감지
- **신뢰 호스트 화이트리스트** — Anthropic / OpenAI / 구글 / Cloudflare /
  AWS / 네이버 / 카카오 등은 절대 공격으로 잡지 않음
- 세 가지 방어 모드: **Off**, **Detect**, **Auto-Block**
- **WinDivert** 기반 실시간 차단 (WFP callout 레이어에서 sub-ms 드랍) +
  `netsh advfirewall` 영구 룰 병행
- 캐릭터 상태 반응: 방어 모드일 때 방패+창 자세, 악마 파티클이 닿으면
  "hurt", 지속 공격 확정되면 "block" 자세 유지
- Attack Log 탭에서 IP별 수동 차단 / 해제

### 로깅
- `<install-dir>/logs/` 폴더에 JSONL 세션 로그 (append-only)
- 트레이 메뉴에서 선택 가능한 로깅 정책:
  - **Off** — 디스크 기록 안 함
  - **Attacks only** (기본값) — 공격으로 플래그된 IP의 패킷만 + 직전
    ≈500개 컨텍스트 자동 dump (포렌식 가치 유지)
  - **Smart** — multicast / mDNS / SSDP / NetBIOS / DHCP / 신뢰 제공자
    트래픽 스킵
  - **All** — 모든 패킷 기록
- 네이티브 확인 다이얼로그가 붙은 수동 "로그 삭제" 버튼
- pcap 링버퍼 (50 MB × 6 = ≈300 MB 회전 윈도우)로 hex dump 즉시 조회 가능,
  tshark가 절대 자체 종료하지 않음
- `tshark` 예기치 못한 종료 시 자동 재시작

### IP ↔ 호스트 학습
- 관찰된 SNI / HTTP Host / DNS A / AAAA 응답이 모두
  `<userData>/ip-host-cache.json` 영구 캐시로 들어감 (LRU, 1만개 한도)
- 시작 시 렌더러가 캐시 부트스트랩 → 브랜드 배지가 재시작 후에도 유지
- 호스트 정보가 전혀 노출되지 않는 IP (디스코드 음성, WebRTC, 게임 UDP)
  를 위한 백그라운드 PTR(역방향 DNS) 리졸버 — 결과는 즉시 렌더러로 푸시

### UI
- 하단 인스펙터 4탭: **Live Traffic**, **Devices**, **Statistics**,
  **Attack Log**
- Devices 탭: NAC 스타일 패시브 인벤토리 (MAC + IP + OUI 기반 제조사 +
  패킷 수 + 마지막 활동 시각)
- Statistics 탭: top talkers, 프로토콜 분포, 분류 태그 분포,
  세션 요약, 디스크 로그 경로
- **다크 / 라이트 테마 전환**, **선택한 인터페이스 기준 로컬 IP 배지**,
  **번들 폰트 선택** (D2Coding / 나눔고딕 / 나눔바른고딕 / 나눔스퀘어Neo /
  Noto Sans KR), **UI 글꼴 크기 선택** — 모두 영구 저장
- 한/영 양 언어 UI — 첫 실행 시 언어 선택 다이얼로그 +
  타이틀바 드롭다운으로 즉시 전환. 네이티브 다이얼로그와 트레이 메뉴도
  같이 번역
- **캡처 버튼과 방어 모드 분리**: 방어 단독 동작 시 실시간 패킷 리스트와
  일반 트래픽 파티클은 숨기고 공격 감지만 백그라운드로 조용히 수행
- 시스템 트레이로 최소화 (캐릭터 픽셀 아트가 트레이 아이콘) —
  창 숨겨도 캡처 + 방어 계속 동작
- 트레이 메뉴: 창 보이기/숨기기, 방어 모드, 로깅 정책,
  로그 폴더 열기, 종료

### 빌드 / 배포
- 두 가지 빌드 타깃:
  - **Portable .exe** (~66 MB) — 단일 파일, 설치 없음
  - **NSIS 인스톨러** (~272 MB) — Wireshark 공식 인스톨러와 WinDivert
    커널 드라이버를 번들. 새 PC도 한 번에 둘 다 설치 가능 (Wireshark가
    이미 깔려 있으면 그 단계는 자동 스킵)
- 트레이 아이콘 / `.ico` / 인스톨러 아트 / 다이얼로그 로고 모두 같은
  캐릭터 픽셀 데이터에서 빌드 시 자동 생성 — 외부 이미지 에셋 0
- 브랜드 아이콘 데이터는 매 빌드 시 `simple-icons`에서 재생성

## 요구사항

### 일반 사용자 (.exe만 실행하면 되는 경우)
- Windows 10 또는 11, **x64**
- **Wireshark** (NSIS 인스톨러는 번들로 포함, Portable은 미설치 시
  다운로드 페이지 다이얼로그 표시)
- **관리자 권한** — raw socket / Npcap 캡처에 필수
  (.exe에 `requireAdministrator` 매니페스트 설정돼서 UAC 자동 요청)

### 개발자 / 소스에서 빌드하는 경우
- Node.js 18+ 및 npm
- WinDivert 헬퍼(`wirechar-divert.exe`) 컴파일을 위해:
  Visual Studio Build Tools + "Desktop development with C++" 워크로드

## 설치

GitHub Releases 페이지에서 빌드 받기:

- `wirechar-<버전>-portable.exe` — 더블클릭, 설치 불필요
- `wirechar-<버전>-setup.exe` — 마법사 설치, WinDivert 드라이버 서비스
  등록, 필요 시 Wireshark 자동 설치

어느 쪽이든 실행 시 UAC 권한 요청이 뜹니다.

## 설정

- **타이틀바**: 테마 토글(🌙/☀), 폰트, 글꼴 크기, 언어.
- **툴바**: 인터페이스 선택, **캡처** 버튼, **방어 모드** 드롭다운
  (`Off` / `Detect` / `Attack Detection + Auto-Block`),
  Wireshark display filter.
- **트레이 메뉴** (캐릭터 아이콘 우클릭): 창 표시/숨기기, 방어 모드,
  디스크 로깅 정책, 로그 폴더 열기, 종료.
- **인스펙터 탭**: 라이브, 기기, 통계, 공격 로그 간 전환.
- **필터 입력**(툴바): Wireshark display-filter 문법 그대로, tshark
  수준에서 적용됨.
- **리스트 검색**(패킷 리스트 위): 메모리 substring + 와일드카드 + CIDR
  + `필드:값` 쿼리.

설정은 `<userData>/settings.json`에 저장됩니다:
언어, 방어 모드, 로깅 정책, 테마, 폰트, 글꼴 크기.

## 소스에서 빌드하기

```bash
git clone <repo>
cd wirechar
npm install

# 개발 모드 (Electron + 실시간 캡처)
npm start

# 아이콘만 생성
npm run gen-icon
npm run gen-brands

# 결과물 빌드
npm run build:portable    # → dist/wirechar-<ver>-portable.exe
npm run build:installer   # → dist/wirechar-<ver>-setup.exe
npm run build:all         # 둘 다
```

인스톨러 빌드 시 필요한 것:

1. `PATH`에 **VS Build Tools** — `build/build-helper.bat`가 `vswhere`로
   자동 탐지해서 `wirechar-divert.exe` 컴파일.
2. 첫 빌드에만 인터넷 — `npm run fetch-wireshark`와
   `npm run fetch-windivert`가 SDK를 한 번 받아 캐시함.

빌드는 elevated PowerShell에서 실행해야 `winCodeSign` 캐시의 심볼릭 링크를
풀 수 있습니다. **Developer Mode**가 켜져 있으면 일반 셸로도 가능.

## 아키텍처 한 눈에

```
main 프로세스 (Electron)             renderer (브라우저 컨텍스트)
├ src/capture.js                    ├ renderer/app.js           — 오케스트레이션
├ src/detector.js  ── ipc ───▶      ├ renderer/character.js     — 픽셀 아트 FSM
├ src/firewall.js                   ├ renderer/particles.js     — 캔버스 애니메이션
├ src/firewall-windivert.js         ├ renderer/brand-styles.js  — 브랜드 배지 (Path2D)
├ src/ip-host-cache.js              ├ renderer/brand-icons-data.js (자동 생성)
├ src/ptr-lookup.js                 ├ renderer/classify.js      — 패킷→사용자 친화 태그
├ src/trusted.js                    ├ renderer/detail.js        — 인스펙터 트리
├ src/search.js                     ├ renderer/search.js        — 와일드카드 / CIDR
├ src/settings.js                   ├ renderer/i18n.js          — 한/영
├ src/dialog-strings.js             ├ renderer/oui.js           — MAC → 제조사
└ main.js                           └ renderer/index.html

build/                   resources/  (패키징됨)
├ windivert-helper/      ┌ icons/, windivert/, wireshark/  (타깃별 필터)
├ generate-icon.js       │
├ generate-brand-icons.js
├ download-wireshark.js
├ download-windivert.js
├ build-helper.bat       — wirechar-divert.exe 컴파일
└ installer.nsh          — NSIS 훅: 번들 Wireshark 설치 + 드라이버 등록
```

## 알려진 한계

- **볼류메트릭 DDoS는 PC 계층에서 못 막습니다.** 회선이 포화되는
  순간 PC 위의 어떤 소프트웨어도 도움 안 됨 — 대역폭은 이미 사라진
  상태. wirechar는 공격을 *감지*하고 *기록*할 수 있지만 실제 완화는
  상위 계층(VPN, ISP 필터, 클라우드 스크러빙)에서 일어나야 합니다.
  Auto-Block 모드는 application-layer flood, SYN flood, slow attack
  같은 소규모 공격에 효과적이지만 기가비트 단위 flood에는 무력합니다.
- **브랜드 매칭은 호스트 정보가 필요.** SNI, HTTP Host, DNS 응답,
  PTR 레코드 어느 것도 노출되지 않는 세션은 wirechar가 그 IP의 정체를
  알 길이 없습니다. PTR 리졸버가 채워줄 때까지는 디스코드 음성 / WebRTC
  미디어에서 자주 발생.
- **같은 broadcast domain만 보임.** 기기 발견(NAC 스타일)은 내 NIC에
  닿는 트래픽만 봅니다 — 다른 VLAN / 다른 홈 네트워크는 안 보임.
  PC 밖을 보려면 스위치 SPAN 포트가 필요합니다.
- **Windows 전용**, x64. Linux / macOS 포팅은 가능하지만 만들지 않음.

## 변경 이력

### 1.0.10
- **방어 모드 UI를 캡처와 분리.** `방어 모드` 선택지가 타이틀바에서
  툴바의 `Capture` 버튼 바로 옆으로 이동. 실시간 패킷 리스트와 일반
  파티클 표시는 이제 **사용자가 직접 캡처 버튼을 눌렀는지**에만
  반응함 — 방어만 켜진 상태에선 공격 패킷만 떠오르고 일상 트래픽은
  숨겨짐(스텔스 모드). 방어가 켜져 있는 동안 캡처를 누르면 전체
  피드가 즉시 표시되고, 다시 누르면 tshark는 그대로 둔 채 스텔스로
  돌아감.
- **인터페이스별 로컬 IP 배지.** 타이틀바 IP가 이제
  `os.networkInterfaces()`가 맨 위에 올린 것 대신 **선택된 NIC의 IPv4**를
  표시. 인터페이스 드롭다운 바꾸면 배지도 즉시 갱신.
- **다크 / 라이트 테마.** 타이틀바에 토글 버튼 추가, 설정 영구 저장.
  캔버스 그리드와 비네트도 테마에 맞춰 자동 변경.
- **번들 폰트 + 글꼴 크기 선택.** 렌더러에 5종 한글 폰트 포함
  (D2Coding, 나눔고딕, 나눔바른고딕, 나눔스퀘어Neo, Noto Sans KR).
  UI는 rem 기반이라 라벨·리스트·패널 헤더가 모두 같은 비율로 스케일
  (9 ~ 24 px). 시작 시 모든 폰트를 미리 로드해서 드롭다운 전환이
  즉시 반영됨.
- **NSIS 업그레이드 시 상태 보존.** 언인스톨러의 WinDivert 서비스 +
  방화벽 룰 정리는 이제 **사용자가 직접 제거할 때만** 실행. 업그레이드
  설치 중 electron-builder가 silent로 옛 언인스톨러를 부를 땐 차단 IP
  룰과 드라이버 서비스 모두 그대로 유지.
- **업그레이드해도 폴더 그대로.** `appId` + `perMachine` 덕에 새 버전은
  `C:\Program Files\wirechar\` 같은 자리에 그대로 덮어쓰기.
  `%APPDATA%\wirechar\` (설정, IP 캐시, 화이트리스트, 로그)도 손대지 않음.

### 그 이전
1.0.1 ~ 1.0.9 는 `git log` 참조. 주요 마일스톤: WinDivert 실시간 차단
(1.0.5), 로그 폴더 `%APPDATA%` 이동(1.0.6), 사용자 화이트리스트 + Attack
Log 의 브랜드 정보(1.0.7), 디스코드 음성 CIDR + 8 초 grace + PTR→detector
동기화(1.0.8), README + LICENSE 동봉(1.0.9).

## 라이선스

wirechar 소스코드는 **GPL-2.0-only** 라이선스로 배포됩니다 ([`License/GNU General Public License v2.0.txt`](License/GNU%20General%20Public%20License%20v2.0.txt) 참조).

이 라이선스를 선택한 이유: 배포 파일에 WinDivert 커널 드라이버
(`WinDivert64.sys`, GPL-2.0)가 번들되므로, 오픈소스 경로로 배포하려면
전체 배포가 GPL-2.0 호환이어야 합니다.

**개인 사용은 완전 무료입니다.** 상업적 배포는 WinDivert와 Npcap의 상업
라이선스를 별도로 취득해야 하고, GPL-2.0의 소스 전면 공개 의무를 모두
이행해야 합니다. 사실상 저자 협의 없이 이 소프트웨어로 돈을 버는 것은
현실적으로 불가능합니다.

배포 빌드에 포함되는 서드파티 컴포넌트:

| 컴포넌트 | 라이선스 | 포함 빌드 |
|---------|---------|---------|
| Wireshark | GPL-2.0 | NSIS 인스톨러 전용 |
| Npcap | 커스텀 (개인용 무료) | Wireshark가 설치 |
| WinDivert | LGPL-2.1 (DLL) / GPL-2.0 (드라이버) | NSIS 인스톨러 |
| simple-icons | CC0 | 빌드 시 임베드 |
| Electron | MIT | 모든 빌드 |
