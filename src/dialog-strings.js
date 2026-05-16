/**
 * Bilingual strings for native dialogs shown from the main process.
 * Renderer has its own richer i18n module; this file only covers the
 * handful of strings used by Electron's `dialog.showMessageBox`.
 */

const STRINGS = {
  // ── Language picker ──
  lang_picker_title:   { en: 'wirechar',                          ko: 'wirechar' },
  lang_picker_message: { en: 'Choose language / 언어 선택',        ko: 'Choose language / 언어 선택' },
  lang_picker_detail:  {
    en: 'You can change this later from the title bar.\n나중에 타이틀 바에서 변경할 수 있습니다.',
    ko: 'You can change this later from the title bar.\n나중에 타이틀 바에서 변경할 수 있습니다.',
  },
  lang_btn_english:    { en: 'English',                           ko: 'English' },
  lang_btn_korean:     { en: '한국어',                             ko: '한국어' },

  // ── Wireshark missing ──
  ws_title:            { en: 'Wireshark required',
                         ko: 'Wireshark 설치 필요' },
  ws_message:          { en: 'Wireshark is not installed.',
                         ko: 'Wireshark가 설치되어 있지 않습니다.' },
  ws_detail:           {
    en: 'wirechar uses tshark (bundled with Wireshark) to capture packets, and Npcap (also bundled) as the capture driver.\n\n' +
        'Install Wireshark to enable packet capture. Make sure "Install Npcap" is checked during the Wireshark installer.\n\n' +
        'After installation, restart wirechar.',
    ko: 'wirechar는 Wireshark에 포함된 tshark로 패킷을 캡처하고, 함께 설치되는 Npcap을 캡처 드라이버로 사용합니다.\n\n' +
        '패킷 캡처를 사용하려면 Wireshark를 설치해야 합니다. Wireshark 설치 도중 "Install Npcap" 옵션이 체크되어 있는지 확인하세요.\n\n' +
        '설치 후 wirechar를 다시 시작하세요.',
  },
  ws_btn_download:     { en: 'Open download page',                ko: '다운로드 페이지 열기' },
  ws_btn_continue:     { en: 'Continue without capture',          ko: '캡처 없이 계속' },
  ws_btn_quit:         { en: 'Quit',                              ko: '종료' },

  // ── Tray menu ──
  tray_tooltip:        { en: 'wirechar — network monitor',         ko: 'wirechar — 네트워크 모니터' },
  tray_show:           { en: 'Show wirechar',                       ko: 'wirechar 열기' },
  tray_hide:           { en: 'Hide to tray',                        ko: '트레이로 숨기기' },
  tray_defense:        { en: 'Defense mode',                        ko: '방어 모드' },
  tray_defense_off:    { en: 'Off',                                 ko: '꺼짐' },
  tray_defense_detect: { en: 'Detect',                              ko: '감지' },
  tray_defense_block:  { en: 'Auto-Block',                          ko: '자동 차단' },
  tray_logging:        { en: 'Disk logging',                        ko: '디스크 로그' },
  tray_log_off:        { en: 'Off (no disk writes)',                 ko: '꺼짐 (기록 안 함)' },
  tray_log_attacks:    { en: 'Attacks only (recommended)',           ko: '공격만 (권장)' },
  tray_log_smart:      { en: 'Smart (skip noise)',                   ko: '스마트 (잡음 제외)' },
  tray_log_all:        { en: 'All packets (forensic)',               ko: '전체 (포렌식)' },
  tray_open_logs:      { en: 'Open logs folder',                    ko: '로그 폴더 열기' },
  tray_quit:           { en: 'Quit wirechar',                       ko: 'wirechar 종료' },

  // ── Clear logs confirmation ──
  logs_clear_title:    { en: 'Clear session logs',                  ko: '세션 로그 정리' },
  logs_clear_message:  { en: 'Permanently delete all saved capture logs?',
                         ko: '저장된 캡처 로그를 모두 영구 삭제하시겠습니까?' },
  logs_clear_detail:   { en: 'The active capture session (if running) will be preserved.\nThis cannot be undone.',
                         ko: '현재 진행 중인 캡처(있는 경우)는 보존됩니다.\n이 작업은 되돌릴 수 없습니다.' },
  logs_clear_confirm:  { en: 'Delete',                               ko: '삭제' },
  logs_clear_cancel:   { en: 'Cancel',                               ko: '취소' },
  logs_clear_empty:    { en: 'No log files to clear',                ko: '삭제할 로그가 없습니다' },
  logs_cleared_ok:     { en: 'Cleared',                              ko: '삭제 완료:' },
  logs_cleared_files:  { en: 'files,',                               ko: '개 파일,' },
  logs_cleared_freed:  { en: 'freed',                                ko: '용량 확보' },
};

function t(key, lang) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[lang] || entry.en || key;
}

module.exports = { t };
