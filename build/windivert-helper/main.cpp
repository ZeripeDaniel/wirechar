// wirechar — WinDivert helper
//
// Stdio-driven packet dropper. wirechar (the Electron app) spawns this exe and
// pushes block-list updates over stdin; we forward stats back over stdout.
//
// Protocol (line-based, one command per line):
//   ADD <ip>             add IPv4 to block list  (e.g. ADD 1.2.3.4)
//   DEL <ip>             remove IPv4 from block list
//   CLEAR                empty the block list
//   STATS                ask for current stats line
//   QUIT                 exit cleanly
//
// Responses:
//   READY                emitted once the divert handle is open
//   OK                   command accepted
//   ERR <message>        command rejected
//   STATS dropped=N allowed=M blocked=K rate=PPS
//
// Build:
//   cl /std:c++17 /O2 /EHsc main.cpp /I "..\windivert\include" /link "..\windivert\WinDivert.lib"
// or use build-helper.bat.

#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <unordered_set>
#include "windivert.h"

#pragma comment(lib, "ws2_32.lib")

// ── State ───────────────────────────────────────────────────────────────────
static HANDLE g_handle = INVALID_HANDLE_VALUE;
static std::unordered_set<UINT32> g_blocked;     // network-order IPv4
static std::mutex g_mu;
static std::atomic<bool> g_running{true};
static std::atomic<uint64_t> g_dropped{0};
static std::atomic<uint64_t> g_allowed{0};
static std::atomic<uint64_t> g_lastDroppedSample{0};
static std::atomic<uint64_t> g_lastAllowedSample{0};

// ── Helpers ─────────────────────────────────────────────────────────────────
static UINT32 parseIPv4(const std::string& s) {
    struct in_addr a;
    if (inet_pton(AF_INET, s.c_str(), &a) != 1) return 0;
    return a.S_un.S_addr;     // network byte order
}
static std::string ipv4ToStr(UINT32 ip) {
    char buf[INET_ADDRSTRLEN];
    struct in_addr a; a.S_un.S_addr = ip;
    if (!inet_ntop(AF_INET, &a, buf, sizeof(buf))) return "?";
    return buf;
}

static void writeLine(const char* fmt, ...) {
    va_list ap; va_start(ap, fmt);
    vfprintf(stdout, fmt, ap);
    va_end(ap);
    fputc('\n', stdout);
    fflush(stdout);
}

// ── Packet loop ─────────────────────────────────────────────────────────────
static void packetLoop() {
    constexpr size_t BUF_SZ = 0xFFFF;
    auto buf = std::make_unique<unsigned char[]>(BUF_SZ);
    UINT len = 0;
    WINDIVERT_ADDRESS addr;

    while (g_running.load()) {
        if (!WinDivertRecv(g_handle, buf.get(), (UINT)BUF_SZ, &len, &addr)) {
            DWORD err = GetLastError();
            if (err == ERROR_OPERATION_ABORTED) break;     // shutdown
            if (err == ERROR_INVALID_HANDLE) break;
            // Best-effort: keep going on transient errors
            Sleep(5);
            continue;
        }

        // Parse to find IP header (v4) and inbound direction
        PWINDIVERT_IPHDR ip4 = nullptr;
        PWINDIVERT_IPV6HDR ip6 = nullptr;
        WinDivertHelperParsePacket(
            buf.get(), len,
            &ip4, &ip6,
            nullptr, nullptr, nullptr,
            nullptr, nullptr,
            nullptr, nullptr,
            nullptr, nullptr);

        bool drop = false;
        if (addr.Outbound == 0 && ip4 != nullptr) {     // inbound IPv4 only for now
            UINT32 src = ip4->SrcAddr;
            {
                std::lock_guard<std::mutex> lk(g_mu);
                drop = g_blocked.find(src) != g_blocked.end();
            }
        }

        if (drop) {
            g_dropped.fetch_add(1, std::memory_order_relaxed);
            // Don't reinject -> packet dies here. No traffic delivered to the stack.
            continue;
        }

        g_allowed.fetch_add(1, std::memory_order_relaxed);
        WinDivertSend(g_handle, buf.get(), len, nullptr, &addr);
    }
}

// ── Stats ticker ────────────────────────────────────────────────────────────
static void statsLoop() {
    using namespace std::chrono;
    auto last = steady_clock::now();
    while (g_running.load()) {
        std::this_thread::sleep_for(seconds(1));
        if (!g_running.load()) break;
        auto now = steady_clock::now();
        double dt = duration<double>(now - last).count();
        last = now;

        uint64_t d = g_dropped.load();
        uint64_t a = g_allowed.load();
        uint64_t dDelta = d - g_lastDroppedSample.exchange(d);
        uint64_t aDelta = a - g_lastAllowedSample.exchange(a);
        size_t cnt;
        { std::lock_guard<std::mutex> lk(g_mu); cnt = g_blocked.size(); }
        double pps = dt > 0 ? (double)(dDelta + aDelta) / dt : 0;
        writeLine("STATS dropped=%llu allowed=%llu blocked=%zu rate=%.0f drop_rate=%.0f",
                  (unsigned long long)d, (unsigned long long)a, cnt, pps,
                  dt > 0 ? (double)dDelta / dt : 0);
    }
}

// ── Command parser ──────────────────────────────────────────────────────────
static void handleCommand(const std::string& cmd) {
    if (cmd.empty()) return;

    // Tokenize: <op> [arg]
    size_t sp = cmd.find(' ');
    std::string op  = (sp == std::string::npos) ? cmd : cmd.substr(0, sp);
    std::string arg = (sp == std::string::npos) ? ""  : cmd.substr(sp + 1);

    if      (op == "ADD") {
        UINT32 ip = parseIPv4(arg);
        if (!ip) { writeLine("ERR bad-ip %s", arg.c_str()); return; }
        std::lock_guard<std::mutex> lk(g_mu);
        g_blocked.insert(ip);
        writeLine("OK add %s", arg.c_str());
    }
    else if (op == "DEL") {
        UINT32 ip = parseIPv4(arg);
        if (!ip) { writeLine("ERR bad-ip %s", arg.c_str()); return; }
        std::lock_guard<std::mutex> lk(g_mu);
        g_blocked.erase(ip);
        writeLine("OK del %s", arg.c_str());
    }
    else if (op == "CLEAR") {
        std::lock_guard<std::mutex> lk(g_mu);
        g_blocked.clear();
        writeLine("OK clear");
    }
    else if (op == "STATS") {
        uint64_t d = g_dropped.load();
        uint64_t a = g_allowed.load();
        size_t cnt;
        { std::lock_guard<std::mutex> lk(g_mu); cnt = g_blocked.size(); }
        writeLine("STATS dropped=%llu allowed=%llu blocked=%zu rate=0 drop_rate=0",
                  (unsigned long long)d, (unsigned long long)a, cnt);
    }
    else if (op == "LIST") {
        std::string out = "OK list";
        std::lock_guard<std::mutex> lk(g_mu);
        for (UINT32 ip : g_blocked) { out += ' '; out += ipv4ToStr(ip); }
        writeLine("%s", out.c_str());
    }
    else if (op == "QUIT") {
        writeLine("OK quit");
        g_running.store(false);
    }
    else {
        writeLine("ERR unknown %s", op.c_str());
    }
}

// ── main ────────────────────────────────────────────────────────────────────
int main() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);

    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        writeLine("ERR wsastartup");
        return 1;
    }

    // Open WinDivert at the NETWORK layer, inbound IPv4 only (cheap pre-filter)
    // We could narrow further by attack type, but keep flexibility for runtime
    // policy changes.
    g_handle = WinDivertOpen(
        "inbound and ip",
        WINDIVERT_LAYER_NETWORK,
        /*priority*/ 0,
        /*flags*/    0);

    if (g_handle == INVALID_HANDLE_VALUE) {
        DWORD err = GetLastError();
        writeLine("ERR open-failed code=%lu  (driver loaded? running as admin?)", err);
        return 1;
    }

    writeLine("READY pid=%lu", GetCurrentProcessId());

    std::thread pktThread(packetLoop);
    std::thread statsThread(statsLoop);

    // Stdin command loop in main thread
    char line[1024];
    while (g_running.load() && fgets(line, sizeof(line), stdin)) {
        // Strip trailing newline/CR
        size_t n = strlen(line);
        while (n > 0 && (line[n-1] == '\n' || line[n-1] == '\r')) line[--n] = 0;
        handleCommand(line);
    }

    g_running.store(false);
    WinDivertShutdown(g_handle, WINDIVERT_SHUTDOWN_BOTH);
    pktThread.join();
    statsThread.join();
    WinDivertClose(g_handle);
    WSACleanup();
    return 0;
}
